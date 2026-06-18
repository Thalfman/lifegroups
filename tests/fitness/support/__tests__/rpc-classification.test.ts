import { describe, expect, it } from "vitest";

import type { EffectiveFunction } from "../sql-functions";
import {
  AUDIT_EXEMPT_WRITES,
  categorize,
  classifyDefiners,
  isWrite,
  nonDefinerAppWrites,
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
    appExecutable: false,
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

  it("treats destructive DML on audit_events as a write (only the insert is exempt)", () => {
    expect(
      isWrite("delete from public.audit_events where created_at < x")
    ).toBe(true);
    expect(isWrite("update public.audit_events set metadata = '{}'")).toBe(
      true
    );
    expect(isWrite("truncate public.audit_events")).toBe(true);
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

  it("detects truncate and merge as writes", () => {
    expect(isWrite("truncate public.members")).toBe(true);
    expect(isWrite("truncate table public.members")).toBe(true);
    expect(
      isWrite("merge into public.members m using src on m.id = src.id")
    ).toBe(true);
  });

  it("detects dynamic DML built with format(... %I ...)", () => {
    expect(
      isWrite("execute format('delete from public.%I where id = 1', v_t)")
    ).toBe(true);
    expect(isWrite("execute format('insert into %I (id) values (1)', t)")).toBe(
      true
    );
    expect(isWrite("execute format('update %I set x = 1', t)")).toBe(true);
  });

  it("detects dynamic truncate / merge built with format(... %I ...)", () => {
    expect(isWrite("execute format('truncate table public.%I', v_table)")).toBe(
      true
    );
    expect(isWrite("execute format('merge into %I using src on x', t)")).toBe(
      true
    );
  });

  it("does not treat a dynamic SELECT as a write", () => {
    expect(isWrite("execute format('select * from %I', t)")).toBe(false);
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

  it("flags a caller of a delegating-exempt helper that writes no audit", () => {
    // Use the real delegating exemption signature so the map drives the check.
    const helperSig = "public.super_admin_clean_slate_restore_payload(jsonb)";
    const helper = fn({
      signature: helperSig,
      name: "public.super_admin_clean_slate_restore_payload",
      body: "insert into public.members select * from jsonb_populate_recordset(null::public.members, p);",
    });
    const goodCaller = fn({
      signature: "public.super_admin_clean_slate_import(jsonb)",
      name: "public.super_admin_clean_slate_import",
      body:
        "perform public.super_admin_clean_slate_restore_payload(p_payload);\n" +
        "insert into public.audit_events (action) values ('super_admin.clean_slate_import');",
    });
    const badCaller = fn({
      signature: "public.super_admin_clean_slate_revert(uuid)",
      name: "public.super_admin_clean_slate_revert",
      body: "perform public.super_admin_clean_slate_restore_payload(v_snapshot.payload);",
    });

    const result = classifyDefiners([helper, goodCaller, badCaller]);
    expect(result.delegationCallers.get(helperSig)).toEqual([
      "public.super_admin_clean_slate_import(jsonb)",
      "public.super_admin_clean_slate_revert(uuid)",
    ]);
    expect(result.delegationViolations).toEqual([
      {
        helper: helperSig,
        caller: "public.super_admin_clean_slate_revert(uuid)",
      },
    ]);
  });

  it("classifies a mutating wrapper (DML only via calls) as a write (closure)", () => {
    // `wrapper` does no direct DML — it only calls `admin_write`, which is a
    // direct write. The closure must pull `wrapper` into the write set and hold
    // it to the self-audit rule.
    const directWrite = fn({
      signature: "public.admin_write()",
      name: "public.admin_write",
      body:
        "insert into public.members (id) values (1);\n" +
        "insert into public.audit_events (action) values ('admin.write');",
    });
    const wrapperAudited = fn({
      signature: "public.admin_wrapper()",
      name: "public.admin_wrapper",
      body:
        "perform public.admin_write();\n" +
        "insert into public.audit_events (action) values ('admin.wrapper');",
    });
    const wrapperUnaudited = fn({
      signature: "public.admin_bad_wrapper()",
      name: "public.admin_bad_wrapper",
      body: "perform public.admin_write();",
    });

    const result = classifyDefiners([
      directWrite,
      wrapperAudited,
      wrapperUnaudited,
    ]);
    expect(result.writes.map((w) => w.signature).sort()).toEqual([
      "public.admin_bad_wrapper()",
      "public.admin_wrapper()",
      "public.admin_write()",
    ]);
    expect([...result.wrapperWrites].sort()).toEqual([
      "public.admin_bad_wrapper()",
      "public.admin_wrapper()",
    ]);
    // The wrapper that drops its audit row is a violation; the audited one is not.
    expect(result.unaudited.map((w) => w.signature)).toEqual([
      "public.admin_bad_wrapper()",
    ]);
  });

  it("follows a write delegated to a non-definer (invoker) helper via allFunctions", () => {
    const wrapper = fn({
      signature: "public.admin_wrapper()",
      name: "public.admin_wrapper",
      isSecurityDefiner: true,
      body: "perform public.invoker_helper();", // no direct DML, no audit
    });
    const invokerHelper = fn({
      signature: "public.invoker_helper()",
      name: "public.invoker_helper",
      isSecurityDefiner: false,
      appExecutable: false, // app EXECUTE revoked → nonDefinerAppWrites can't see it
      body: "delete from public.members where id = 1",
    });
    // Without allFunctions the helper is invisible → wrapper stays read_helper.
    const blind = classifyDefiners([wrapper]);
    expect(blind.writes.map((w) => w.signature)).not.toContain(
      "public.admin_wrapper()"
    );
    // With allFunctions the closure follows the delegated write → wrapper audits.
    const seen = classifyDefiners([wrapper], [wrapper, invokerHelper]);
    expect(seen.writes.map((w) => w.signature)).toContain(
      "public.admin_wrapper()"
    );
    expect(seen.unaudited.map((w) => w.signature)).toContain(
      "public.admin_wrapper()"
    );
  });

  it("flags a requiresNoAppGrant helper that becomes app-executable", () => {
    const helperSig = "public.super_admin_clean_slate_restore_payload(jsonb)";
    const exposed = fn({
      signature: helperSig,
      name: "public.super_admin_clean_slate_restore_payload",
      appExecutable: true, // grant premise broken
      body: "insert into public.members select * from jsonb_populate_recordset(null::public.members, p);",
    });
    expect(classifyDefiners([exposed]).appExposedExemptHelpers).toEqual([
      helperSig,
    ]);

    const lockedDown = fn({ ...exposed, appExecutable: false });
    expect(classifyDefiners([lockedDown]).appExposedExemptHelpers).toEqual([]);
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

describe("nonDefinerAppWrites", () => {
  it("flags an app-callable non-definer that performs DML", () => {
    const bypass = fn({
      signature: "public.sneaky_write()",
      isSecurityDefiner: false,
      appExecutable: true,
      body: "delete from public.members where id = 1",
    });
    expect(nonDefinerAppWrites([bypass]).map((f) => f.signature)).toEqual([
      "public.sneaky_write()",
    ]);
  });

  it("ignores a SECURITY DEFINER write, a read, a trigger, and an uncallable helper", () => {
    const definerWrite = fn({
      signature: "public.admin_write()",
      isSecurityDefiner: true,
      appExecutable: true,
      body: "insert into public.members (id) values (1)",
    });
    const read = fn({
      signature: "public.helper()",
      isSecurityDefiner: false,
      appExecutable: true,
      body: "select 1",
    });
    const trigger = fn({
      signature: "public.t()",
      isSecurityDefiner: false,
      returnsTrigger: true,
      appExecutable: true,
      body: "update public.members set x = 1; return new;",
    });
    const uncallable = fn({
      signature: "public.internal_write()",
      isSecurityDefiner: false,
      appExecutable: false, // revoked from public
      body: "insert into public.members (id) values (1)",
    });
    expect(
      nonDefinerAppWrites([definerWrite, read, trigger, uncallable])
    ).toEqual([]);
  });
});
