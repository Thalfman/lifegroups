import { describe, expect, it } from "vitest";

import {
  auditFieldPairs,
  auditMetadataBlocks,
  collectVariableAssignments,
  doBlockBodies,
  expandVariableReferences,
  isContentFreeValue,
  preprocessKeepStrings,
} from "../audit-trace";

describe("preprocessKeepStrings", () => {
  it("strips comments but KEEPS single-quoted strings (the jsonb keys)", () => {
    const out = preprocessKeepStrings(
      "v_x := jsonb_build_object('body', v_body); -- a comment\n"
    );
    expect(out).not.toMatch(/a comment/);
    expect(out).toMatch(/'body'/);
    expect(out).toMatch(/v_body/);
  });

  it("blanks dollar-quoted literals only when asked (extracted body)", () => {
    const withDollar = "raise notice $m$ insert into public.audit_events $m$;";
    expect(
      preprocessKeepStrings(withDollar, { stripDollar: true })
    ).not.toMatch(/audit_events/);
    expect(preprocessKeepStrings(withDollar, { stripDollar: false })).toMatch(
      /audit_events/
    );
  });
});

describe("auditMetadataBlocks", () => {
  it("slices the audit insert statement, keeping keys, string-aware to the `;`", () => {
    const body =
      "insert into public.members (notes) values ('a; b');\n" +
      "insert into public.audit_events (metadata) values (jsonb_build_object('k', 'v; w'));\n" +
      "select 1;";
    const blocks = auditMetadataBlocks(body);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatch(/audit_events/);
    expect(blocks[0]).toMatch(/'k'/);
    // The `;` inside the 'v; w' literal must not end the block early.
    expect(blocks[0]).toMatch(/'v; w'/);
  });

  it("excludes the same-prefix audit_events_archive table", () => {
    expect(
      auditMetadataBlocks(
        "insert into public.audit_events_archive (id) values (1);"
      )
    ).toEqual([]);
  });
});

describe("collectVariableAssignments", () => {
  it("captures a plain `v_x := <rhs>`", () => {
    const map = collectVariableAssignments(
      preprocessKeepStrings("v_after := jsonb_build_object('a', v_a);")
    );
    expect(map.get("v_after")?.[0]).toMatch(/jsonb_build_object\('a', v_a\)/);
  });

  it("captures a typed DECLARE-block initializer (#710)", () => {
    const map = collectVariableAssignments(
      preprocessKeepStrings(
        "v_after jsonb := jsonb_build_object('body', v_body);"
      )
    );
    expect(map.get("v_after")?.[0]).toMatch(
      /jsonb_build_object\('body', v_body\)/
    );
  });

  it("captures a single-target JSON `SELECT … INTO` snapshot (#710)", () => {
    const map = collectVariableAssignments(
      preprocessKeepStrings(
        "select jsonb_build_object('body', body) into v_before from t;"
      )
    );
    expect(map.get("v_before")?.[0]).toMatch(
      /jsonb_build_object\('body', body\)/
    );
  });

  it("does NOT capture a multi-column row/record `SELECT … INTO`", () => {
    const map = collectVariableAssignments(
      preprocessKeepStrings(
        "select id, full_name, notes into v_row from public.guests;"
      )
    );
    expect(map.has("v_row")).toBe(false);
  });

  it("keeps a `;` inside a string literal from ending the right-hand side early", () => {
    const map = collectVariableAssignments(
      preprocessKeepStrings("v_x := 'a; b' || jsonb_build_object('k', 1);")
    );
    expect(map.get("v_x")?.[0]).toMatch(/'a; b'/);
    expect(map.get("v_x")?.[0]).toMatch(/jsonb_build_object/);
  });
});

describe("expandVariableReferences", () => {
  const assignments = (text: string) =>
    collectVariableAssignments(preprocessKeepStrings(text));

  it("inlines a jsonb-assembly variable, surfacing its inner value token", () => {
    const a = assignments("v_after := jsonb_build_object('body', v_body);");
    expect(expandVariableReferences("'after', v_after", a)).toMatch(
      /\bv_body\b/
    );
  });

  it("does NOT inline a scalar (non-jsonb) assignment", () => {
    const a = assignments("v_notes := nullif(btrim(p_secret_note), '');");
    expect(expandVariableReferences("'notes', v_notes", a)).not.toMatch(
      /p_secret_note/
    );
  });

  it("does NOT inline a variable used only as a presence predicate", () => {
    const a = assignments("v_after := jsonb_build_object('x', v_inner);");
    expect(
      expandVariableReferences("'has_after', v_after is not null", a)
    ).not.toMatch(/\bv_inner\b/);
  });

  it("inlines transitively through nested jsonb assembly", () => {
    const a = assignments(
      "v_outer := jsonb_build_object('inner', v_inner); v_inner := jsonb_build_object('body', v_body);"
    );
    expect(expandVariableReferences("'after', v_outer", a)).toMatch(
      /\bv_body\b/
    );
  });

  it("terminates on an assignment cycle", () => {
    const a = assignments(
      "v_a := v_b || jsonb_build_object('k', 1); v_b := v_a || jsonb_build_object('k', 2);"
    );
    const out = expandVariableReferences("'after', v_a", a);
    expect(out).toMatch(/\bv_a\b/);
    expect(out).toMatch(/\bv_b\b/);
  });
});

describe("auditFieldPairs", () => {
  it("reads alternating key/value pairs from jsonb_build_object", () => {
    const pairs = auditFieldPairs(
      "jsonb_build_object('body', v_body, 'has_x', v_x is not null)"
    );
    expect(pairs).toEqual([
      { key: "body", value: "v_body" },
      { key: "has_x", value: "v_x is not null" },
    ]);
  });

  it("yields a null key for a dynamic (non-literal) key", () => {
    const pairs = auditFieldPairs(
      "jsonb_build_object(v_key, jsonb_array_length(p_payload))"
    );
    expect(pairs[0].key).toBeNull();
  });

  it("finds nested jsonb_build_object calls in their own right", () => {
    const pairs = auditFieldPairs(
      "jsonb_build_object('before', jsonb_build_object('body', v_body))"
    );
    const keys = pairs.map((p) => p.key);
    expect(keys).toContain("before");
    expect(keys).toContain("body");
  });

  it("keeps a value with a top-level comma inside nested parens whole", () => {
    const pairs = auditFieldPairs(
      "jsonb_build_object('k', coalesce(v_a, v_b))"
    );
    expect(pairs).toEqual([{ key: "k", value: "coalesce(v_a, v_b)" }]);
  });
});

describe("isContentFreeValue", () => {
  it("allows presence, cardinality/type, constants, and string literals", () => {
    expect(isContentFreeValue("v_body is not null")).toBe(true);
    expect(isContentFreeValue("jsonb_array_length(p_payload -> 'g')")).toBe(
      true
    );
    expect(isContentFreeValue("jsonb_typeof(v_x)")).toBe(true);
    expect(isContentFreeValue("true")).toBe(true);
    expect(isContentFreeValue("42")).toBe(true);
    expect(isContentFreeValue("'ADR 0024 backfill'")).toBe(true);
    expect(isContentFreeValue("'launch'::text")).toBe(true);
  });

  it("rejects a value that carries content (variable, column, concatenation)", () => {
    expect(isContentFreeValue("v_body")).toBe(false);
    expect(isContentFreeValue("care.notes")).toBe(false);
    expect(isContentFreeValue("'prefix ' || p_notes")).toBe(false);
  });
});

describe("doBlockBodies", () => {
  it("extracts each top-level DO block body", () => {
    const bodies = doBlockBodies(
      "do $$ begin v_x := 1; end $$;\nselect 1;\ndo $tag$ begin v_y := 2; end $tag$;"
    );
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toMatch(/v_x := 1/);
    expect(bodies[1]).toMatch(/v_y := 2/);
  });

  it("returns nothing when there is no DO block", () => {
    expect(doBlockBodies("select 1; update t set a = 1;")).toEqual([]);
  });
});
