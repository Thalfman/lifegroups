import { describe, expect, it } from "vitest";

import {
  effectiveSelectPolicies,
  listMigrations,
  loadMigration,
  selectPolicies,
  type MigrationSql,
  type ParsedPolicy,
} from "./migration-safety";

// ===========================================================================
// Admin RLS read-visibility sweep — the single source of truth for "what each
// tier can and cannot SELECT".
//
// This is the matrix-driven regression net for the admin RLS visibility audit:
// "everything an admin should see, they can; everything they shouldn't, they
// can't." CI has no Postgres (RLS is verified manually per supabase/dev/README),
// so — like the per-migration suites — it asserts statically over the migration
// SQL, reusing the lib/admin/__tests__/migration-safety helpers.
//
// Two mechanisms, kept separate on purpose:
//   1. COVERAGE GUARD — every table with RLS enabled must appear in MATRIX. A
//      future migration that enables RLS on a new table without classifying its
//      visibility here fails the build. This is how the policy stays tied down
//      going forward.
//   2. PER-TABLE ASSERTIONS — each table's SELECT policy is checked against its
//      declared class, pinned to the AUTHORITATIVE migration (the last writer),
//      so a dropped or pre-consolidation policy never gives false confidence.
//      Cross-migration overrides (audit_events, the perf consolidation, the
//      pivot11 care-note arm) are resolved via effectiveSelectPolicies where the
//      negative ladder needs the post-override state.
//
// Visibility classes (who may SELECT):
//   ADMIN_READ            — both admins (auth_is_admin).
//   CONFIG_SCOPED         — admins read all keys; non-admins read one shared key.
//   SUPER_ADMIN_ONLY      — super_admin only; Ministry Admin EXCLUDED.
//   LEADER_SCOPED         — admins read all; a leader reads their group's rows.
//   OVER_SHEPHERD_SCOPED  — admins read all; an Over-Shepherd reads coverage.
//   CARE_NOTE_EXCEPTION   — author always; ladder only on the SAME active grant.
//   PRIVATE_NOTE_EXCEPTION— creator-only ministry_admin; Super Admin EXCLUDED.
//   NO_READ               — RLS on, NO SELECT policy; RPC-only reads.
// ===========================================================================
import { MATRIX, type RlsExpectation } from "./rls-visibility-matrix";

const ALL: readonly MigrationSql[] = listMigrations().map(loadMigration);

function authoritativePolicy(entry: RlsExpectation): ParsedPolicy | undefined {
  return selectPolicies(
    loadMigration(entry.authoritativeMigration),
    entry.table
  ).find((p) => p.name === entry.policyName);
}

describe("admin RLS visibility sweep — coverage guard", () => {
  it("classifies exactly the set of RLS-enabled tables", () => {
    const enabled = [...tablesEnabled()].sort();
    const classified = [...new Set(MATRIX.map((e) => e.table))].sort();

    const unclassified = enabled.filter((t) => !classified.includes(t));
    const stale = classified.filter((t) => !enabled.includes(t));

    expect(
      unclassified,
      "RLS is enabled on these table(s) but they are not in MATRIX — classify each one's read visibility in admin-rls-visibility-sweep.test.ts"
    ).toEqual([]);
    expect(
      stale,
      "these MATRIX table(s) no longer have RLS enabled — remove or update their entry"
    ).toEqual([]);
  });

  it("has no duplicate table entries", () => {
    const seen = MATRIX.map((e) => e.table);
    expect(seen.length).toBe(new Set(seen).size);
  });

  function tablesEnabled(): Set<string> {
    // Local re-import to keep the helper name close to the assertion.
    const re = /alter table\s+(?:public\.)?(\w+)\s+enable row level security/g;
    const out = new Set<string>();
    for (const m of ALL)
      for (const match of m.lower.matchAll(re)) out.add(match[1]);
    return out;
  }
});

describe.each(MATRIX)("$table [$cls]", (entry) => {
  if (entry.cls === "NO_READ") {
    it("has RLS enabled but NO SELECT policy anywhere (RPC-only)", () => {
      const anySelect = ALL.flatMap((m) => selectPolicies(m, entry.table));
      expect(
        anySelect.map((p) => p.name),
        `${entry.table} should be RPC-only — found a SELECT policy`
      ).toEqual([]);
    });
    return;
  }

  it(`defines its authoritative SELECT policy (${entry.policyName})`, () => {
    expect(
      authoritativePolicy(entry),
      `${entry.policyName} on ${entry.table} should exist in ${entry.authoritativeMigration}`
    ).toBeDefined();
  });

  it("requires the expected predicate tokens (positive: can read)", () => {
    const predicate = authoritativePolicy(entry)?.predicate ?? "";
    for (const token of entry.expect ?? [])
      expect(
        predicate,
        `${entry.table} predicate should contain "${token}"`
      ).toContain(token);
  });

  it("forbids the forbidden predicate tokens (negative: cannot read)", () => {
    const predicate = authoritativePolicy(entry)?.predicate ?? "";
    for (const token of entry.forbid ?? [])
      expect(
        predicate,
        `${entry.table} predicate should NOT contain "${token}"`
      ).not.toContain(token);
  });

  if (entry.cls === "SUPER_ADMIN_ONLY") {
    it("has no surviving bare-admin SELECT policy (Ministry Admin sealed out)", () => {
      const live = effectiveSelectPolicies(ALL, entry.table);
      // Every still-in-effect SELECT policy must gate on super_admin, never on
      // the bare admin helper (which would re-admit Ministry Admin).
      for (const policy of live)
        expect(
          policy.predicate,
          `${entry.table} has a surviving SELECT policy "${policy.name}" using auth_is_admin — Ministry Admin would be re-admitted`
        ).not.toContain("auth_is_admin");
      expect(
        live.map((p) => p.name),
        `${entry.table} should have a super-admin SELECT policy in effect`
      ).toContain(entry.policyName);
    });
  }

  if (entry.cls === "CARE_NOTE_EXCEPTION") {
    it("conjoins the admin arm with the grant (no bare 'or auth_is_admin()')", () => {
      const predicate = authoritativePolicy(entry)?.predicate ?? "";
      // A bare disjunctive admin read would let the ladder (or super_admin) read
      // a sealed note. The admin arm must always be AND-ed with the grant EXISTS.
      // Both call forms are forbidden: the bare helper and its #860
      // InitPlan-wrapped `(select public.auth_is_admin())` spelling.
      expect(predicate).not.toMatch(
        /or\s+(?:\(\s*select\s+)?public\.auth_is_admin\(\)\s*\)?\s*\)/
      );
    });
  }
});
