import { describe, expect, it } from "vitest";

import {
  collectVariableAssignments,
  doBlockBodies,
  expandVariableReferences,
  normalizeSqlScope,
} from "../audit-trace";

describe("normalizeSqlScope", () => {
  it("strips comments and single-quoted strings to spaces", () => {
    const out = normalizeSqlScope(
      "v_x := 'secret'; -- a comment with body\n select notes"
    );
    expect(out).not.toMatch(/secret/);
    expect(out).not.toMatch(/a comment with body/);
    expect(out).toMatch(/v_x :=/);
    expect(out).toMatch(/select notes/);
  });

  it("blanks dollar-quoted literals only when asked (extracted body)", () => {
    const withDollar = "raise notice $m$ insert into public.audit_events $m$;";
    expect(normalizeSqlScope(withDollar, { stripDollar: true })).not.toMatch(
      /audit_events/
    );
    expect(normalizeSqlScope(withDollar, { stripDollar: false })).toMatch(
      /audit_events/
    );
  });
});

describe("collectVariableAssignments", () => {
  it("captures `v_x := <rhs>` up to the statement terminator", () => {
    const map = collectVariableAssignments(
      normalizeSqlScope(
        "v_after := jsonb_build_object('a', v_a); v_b := 1 + 2;"
      )
    );
    expect(map.get("v_after")?.[0].replace(/\s+/g, " ")).toBe(
      "jsonb_build_object( , v_a)"
    );
    expect(map.get("v_b")).toEqual(["1 + 2"]);
  });

  it("keeps every right-hand side when a variable is assigned more than once", () => {
    const map = collectVariableAssignments(
      normalizeSqlScope("v_x := 1; v_x := v_y + 3;")
    );
    expect(map.get("v_x")).toEqual(["1", "v_y + 3"]);
  });

  it("does NOT capture SELECT … INTO row/record captures", () => {
    const map = collectVariableAssignments(
      normalizeSqlScope(
        "select id, full_name, notes into v_row from public.guests;"
      )
    );
    expect(map.has("v_row")).toBe(false);
  });

  it("keeps a nested-paren right-hand side whole", () => {
    const map = collectVariableAssignments(
      normalizeSqlScope("v_x := coalesce(nullif(v_y, 0), (1 + 2));")
    );
    expect(map.get("v_x")?.[0].replace(/\s+/g, " ")).toBe(
      "coalesce(nullif(v_y, 0), (1 + 2))"
    );
  });
});

describe("expandVariableReferences", () => {
  const assignments = (text: string) =>
    collectVariableAssignments(normalizeSqlScope(text));

  it("inlines a jsonb-assembly variable, surfacing its inner value token", () => {
    const a = assignments("v_after := jsonb_build_object('body', v_body);");
    const out = expandVariableReferences("'after', v_after", a);
    expect(out).toMatch(/\bv_body\b/);
  });

  it("does NOT inline a scalar (non-jsonb) assignment", () => {
    const a = assignments("v_notes := nullif(btrim(p_secret_note), '');");
    const out = expandVariableReferences("'notes', v_notes", a);
    // The scalar's right-hand side (and `p_secret_note`) is not pulled in; only
    // the `v_notes` token the caller already had remains.
    expect(out).not.toMatch(/p_secret_note/);
  });

  it("does NOT inline a variable used only as a presence predicate", () => {
    const a = assignments("v_after := jsonb_build_object('x', v_inner);");
    const out = expandVariableReferences("'has_after', v_after is not null", a);
    expect(out).not.toMatch(/\bv_inner\b/);
  });

  it("inlines transitively through nested jsonb assembly", () => {
    const a = assignments(
      "v_outer := jsonb_build_object('inner', v_inner); v_inner := jsonb_build_object('body', v_body);"
    );
    const out = expandVariableReferences("'after', v_outer", a);
    expect(out).toMatch(/\bv_body\b/);
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
