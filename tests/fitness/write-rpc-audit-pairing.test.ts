import { describe, expect, it } from "vitest";

import { readSourceFiles } from "./support/source-globber";
import { effectiveFunctions } from "./support/sql-functions";
import {
  AUDIT_EXEMPT_WRITES,
  classifyDefiners,
  nonDefinerAppWrites,
} from "./support/rpc-classification";

// Write-RPC audit-pairing catalog check (issue #700) — the STATIC half of the
// audit guarantee. Every app-driven mutation flows through a narrow
// `SECURITY DEFINER` RPC that writes a paired `audit_events` row in the same
// transaction (CLAUDE.md / AGENTS.md P0). This check classifies every definer in
// supabase/migrations/** as WRITE / READ_HELPER / TRIGGER (explicitly — nothing
// is silently skipped) and asserts each WRITE inserts into `audit_events`, OR is
// a deliberate, justified entry in AUDIT_EXEMPT_WRITES.
//
// Out of scope (covered elsewhere): the transactional/atomic pairing — that a
// failed write ROLLS BACK its audit row — is proven by
// tests/integration/action-pipeline.test.ts. Trigger functions are excluded:
// their audit (if any) is the responsibility of the statement / RPC that fires
// them, not the trigger body.

const MIGRATIONS = readSourceFiles({
  roots: ["supabase/migrations"],
  extensions: [".sql"],
});

const ALL_FUNCTIONS = effectiveFunctions(MIGRATIONS);
const definers = ALL_FUNCTIONS.filter((f) => f.isSecurityDefiner);
const classified = classifyDefiners(definers, ALL_FUNCTIONS);

describe("fitness: every WRITE SECURITY DEFINER RPC pairs an audit_events insert", () => {
  it("finds migrations and a substantial definer set (sanity floor)", () => {
    expect(MIGRATIONS.length).toBeGreaterThan(0);
    expect(definers.length).toBeGreaterThan(50);
  });

  it("classifies every definer exactly once (no silent skips)", () => {
    const total =
      classified.writes.length +
      classified.reads.length +
      classified.triggers.length;
    expect(total).toBe(definers.length);
    // Floors so a parser regression can't make the check pass vacuously.
    expect(classified.writes.length).toBeGreaterThan(50);
    expect(classified.triggers.length).toBeGreaterThanOrEqual(2);
  });

  it("every WRITE RPC inserts into audit_events (or is a justified exception)", () => {
    const violations = classified.unaudited.map(
      (f) => `  ${f.signature}  (defined ${f.definedAt})`
    );
    expect(
      violations,
      violations.length === 0
        ? ""
        : `These WRITE SECURITY DEFINER RPCs perform DML on a non-audit table ` +
            `but never insert into public.audit_events in the same body. Add a ` +
            `paired audit insert, or — if the write is legitimately unaudited — ` +
            `add a justified entry to AUDIT_EXEMPT_WRITES in ` +
            `tests/fitness/support/rpc-classification.ts:\n${violations.join("\n")}`
    ).toEqual([]);
  });

  it("audits the callers of every delegating exemption (no dropped guarantee)", () => {
    // A `delegatesToCallers` exemption (the no-grant clean-slate restore helper)
    // only holds if its callers actually audit. Each such helper must have ≥1
    // caller, and every caller must insert audit_events.
    const noCallers: string[] = [];
    for (const [sig, ex] of AUDIT_EXEMPT_WRITES) {
      if (!ex.delegatesToCallers) continue;
      const callers = classified.delegationCallers.get(sig) ?? [];
      if (callers.length === 0) noCallers.push(sig);
    }
    const violations = classified.delegationViolations.map(
      (v) =>
        `  ${v.caller}  drives exempt ${v.helper} but writes no audit_events`
    );
    expect(
      noCallers,
      noCallers.length === 0
        ? ""
        : `These delegating exemptions have no caller that drives them — the ` +
            `exemption is stale or the helper was inlined:\n  ${noCallers.join("\n  ")}`
    ).toEqual([]);
    expect(
      violations,
      violations.length === 0
        ? ""
        : `A caller of a delegating-exempt helper must write its own ` +
            `audit_events row:\n${violations.join("\n")}`
    ).toEqual([]);
  });

  it("holds mutating wrappers (write-by-call) to the same audit rule", () => {
    // A definer that mutates only by calling other write RPCs (e.g.
    // super_admin_reset_all) is pulled in by the write closure — it cannot hide
    // in READ_HELPER. Such a wrapper exists today, and each one self-audits (so it
    // never lands in `unaudited`); removing its envelope audit would now fail the
    // "every WRITE RPC inserts into audit_events" check above.
    expect(classified.wrapperWrites.length).toBeGreaterThan(0);
    for (const sig of classified.wrapperWrites) {
      expect(classified.writes.map((w) => w.signature)).toContain(sig);
      expect(classified.unaudited.map((w) => w.signature)).not.toContain(sig);
    }
  });

  it("no app-callable write RPC bypasses the SECURITY DEFINER layer", () => {
    // The invariant guards more than definers: a SECURITY INVOKER (or default)
    // function that does DML and is granted to an app role can be called via
    // `.rpc()` and skips the audited definer layer entirely. There are none today.
    const bypass = nonDefinerAppWrites(ALL_FUNCTIONS).map(
      (f) => `  ${f.signature}  (defined ${f.definedAt})`
    );
    expect(
      bypass,
      bypass.length === 0
        ? ""
        : `These functions perform DML and are EXECUTE-able by an app login role ` +
            `(public/anon/authenticated) but are NOT SECURITY DEFINER — an app ` +
            `write that bypasses the narrow audited RPC layer. Make them ` +
            `SECURITY DEFINER with a paired audit_events insert, or revoke the ` +
            `app grant:\n${bypass.join("\n")}`
    ).toEqual([]);
  });

  it("keeps no-grant exemptions actually uncallable by app roles", () => {
    // A `requiresNoAppGrant` exemption (the clean-slate restore helper) is only
    // safe while no app role can EXECUTE it. If a later migration grants it to
    // authenticated/anon/public, its unaudited write becomes app-reachable.
    const exposed = classified.appExposedExemptHelpers;
    expect(
      exposed,
      exposed.length === 0
        ? ""
        : `These AUDIT_EXEMPT_WRITES helpers are marked requiresNoAppGrant but ` +
            `are now EXECUTE-able by an app login role — the exemption premise is ` +
            `broken. Revoke the grant, or drop the exemption and audit the ` +
            `write:\n  ${exposed.join("\n  ")}`
    ).toEqual([]);
  });

  it("keeps AUDIT_EXEMPT_WRITES honest (no stale entries)", () => {
    const bySig = new Map(definers.map((f) => [f.signature, f]));
    const stale: string[] = [];
    for (const sig of AUDIT_EXEMPT_WRITES.keys()) {
      // Stale if the signature no longer exists, is no longer a write, or now
      // self-audits — in any of those cases `exemptedUsed` won't contain it.
      if (!bySig.has(sig) || !classified.exemptedUsed.has(sig)) stale.push(sig);
    }
    expect(
      stale,
      stale.length === 0
        ? ""
        : `These AUDIT_EXEMPT_WRITES entries no longer map to a write RPC that ` +
            `lacks an audit insert — remove them:\n  ${stale.join("\n  ")}`
    ).toEqual([]);
  });
});
