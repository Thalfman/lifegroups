import { describe, expect, it } from "vitest";

import type { EffectiveFunction } from "../sql-functions";
import {
  AUDIT_EXEMPT_WRITES,
  categorize,
  classifyDefiners,
  isWrite,
} from "../rpc-classification";

// Build an EffectiveFunction with sensible defaults for the fields a test
// doesn't care about.
function fn(
  over: Partial<EffectiveFunction> & { signature: string }
): EffectiveFunction {
  return {
    name: over.signature.split("(")[0],
    argTypes: [],
    isSecurityDefiner: true,
    pinsSearchPath: true,
    returnsTrigger: false,
    isReadOnlyVolatility: false,
    body: "",
    definedAt: "m.sql:1",
    ...over,
  };
}

describe("isWrite", () => {
  it("detects insert / update / delete on a real table", () => {
    expect(isWrite("insert into public.members (id) values (1)")).toBe(true);
    expect(isWrite("update public.groups set name = 'x'")).toBe(true);
    expect(isWrite("delete from group_leaders where id = 1")).toBe(true);
  });

  it("is false for a pure read", () => {
    expect(isWrite("select id from public.members where id = 1")).toBe(false);
  });

  it("is false when the only DML is the audit_events insert itself", () => {
    expect(
      isWrite("insert into public.audit_events (action) values ('x')")
    ).toBe(false);
  });

  it("ignores DML hidden inside a single-quoted string (dynamic SQL)", () => {
    expect(isWrite("execute 'delete from public.members where id = 1'")).toBe(
      false
    );
  });

  it("treats an insert … on conflict do update as a write (real table)", () => {
    expect(
      isWrite(
        "insert into public.note_grants (id) values (1) on conflict (id) do update set x = 1"
      )
    ).toBe(true);
  });
});

describe("categorize", () => {
  it("trigger functions are TRIGGER regardless of body DML", () => {
    expect(
      categorize(
        fn({
          signature: "public.t()",
          returnsTrigger: true,
          body: "update public.members set last_contact = now()",
        })
      )
    ).toBe("trigger");
  });

  it("a DML body that is not a trigger is WRITE", () => {
    expect(
      categorize(
        fn({
          signature: "public.w()",
          body: "insert into public.members values (1)",
        })
      )
    ).toBe("write");
  });

  it("a read-only body is READ_HELPER", () => {
    expect(categorize(fn({ signature: "public.r()", body: "select 1" }))).toBe(
      "read_helper"
    );
  });
});

describe("classifyDefiners", () => {
  it("partitions writes / reads / triggers and flags unaudited writes", () => {
    const writeAudited = fn({
      signature: "public.admin_do()",
      body:
        "insert into public.members (id) values (1);\n" +
        "insert into public.audit_events (action) values ('admin.do');",
    });
    const read = fn({
      signature: "public.auth_is_admin()",
      body: "select true",
    });
    const trigger = fn({
      signature: "public.t()",
      returnsTrigger: true,
      body: "return new;",
    });
    const writeUnaudited = fn({
      signature: "public.admin_oops()",
      body: "update public.groups set name = 'x'",
    });

    const result = classifyDefiners([
      writeAudited,
      read,
      trigger,
      writeUnaudited,
    ]);

    expect(result.writes.map((f) => f.signature)).toEqual([
      "public.admin_do()",
      "public.admin_oops()",
    ]);
    expect(result.reads.map((f) => f.signature)).toEqual([
      "public.auth_is_admin()",
    ]);
    expect(result.triggers.map((f) => f.signature)).toEqual(["public.t()"]);
    expect(result.unaudited.map((f) => f.signature)).toEqual([
      "public.admin_oops()",
    ]);
  });

  it("does not flag an exempt unaudited write, and records it as used", () => {
    const [exemptSig] = [...AUDIT_EXEMPT_WRITES.keys()];
    const exempt = fn({
      signature: exemptSig,
      body: "insert into public.usage_events (id) values (1)",
    });
    const result = classifyDefiners([exempt]);
    expect(result.unaudited).toEqual([]);
    expect(result.exemptedUsed.has(exemptSig)).toBe(true);
  });

  it("does NOT mark an exemption used when that write now self-audits", () => {
    const [exemptSig] = [...AUDIT_EXEMPT_WRITES.keys()];
    const nowAudits = fn({
      signature: exemptSig,
      body:
        "insert into public.usage_events (id) values (1);\n" +
        "insert into public.audit_events (action) values ('x');",
    });
    const result = classifyDefiners([nowAudits]);
    expect(result.unaudited).toEqual([]);
    // It self-audits, so the exemption is no longer needed (staleness signal).
    expect(result.exemptedUsed.has(exemptSig)).toBe(false);
  });

  it("treats a conditional `if found then insert audit` as audited", () => {
    const conditional = fn({
      signature: "public.mark_seen()",
      body:
        "insert into public.first_run_orientations (profile_id) values (v_id) on conflict do nothing;\n" +
        "if found then\n" +
        "  insert into public.audit_events (action) values ('account.mark_orientation_seen');\n" +
        "end if;",
    });
    const result = classifyDefiners([conditional]);
    expect(result.unaudited).toEqual([]);
    expect(result.writes.map((f) => f.signature)).toEqual([
      "public.mark_seen()",
    ]);
  });
});
