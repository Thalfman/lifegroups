import { describe, expect, it } from "vitest";

import { readSourceFiles } from "./support/source-globber";
import { effectiveFunctions } from "./support/sql-functions";
import {
  AUDIT_EXEMPT_WRITES,
  classifyDefiners,
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

const definers = effectiveFunctions(MIGRATIONS).filter(
  (f) => f.isSecurityDefiner
);
const classified = classifyDefiners(definers);

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
