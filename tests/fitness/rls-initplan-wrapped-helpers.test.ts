import { describe, expect, it } from "vitest";

import {
  effectiveSelectPolicies,
  listMigrations,
  loadMigration,
  tablesWithRlsEnabled,
} from "@/lib/admin/__tests__/migration-safety";

// Performance invariant (#860): **no SELECT policy in force calls a
// no-argument SECURITY DEFINER helper bare in its `USING` clause.** A bare
// `public.auth_is_admin()` (or `auth_profile_id()`, `auth_role()`, …) is
// re-executed for every candidate row — a per-row `profiles` lookup on the hot
// directory/roster/care reads. Wrapped as `(select public.auth_is_admin())`
// the planner hoists it into a once-per-query InitPlan; visibility semantics
// are identical. This is the standard Supabase `auth_rls_initplan` finding.
// Migration `20260714010000` applied the wrapping to every in-force policy;
// this scan keeps future policies wrapped.
//
// Row-argument helpers (`auth_is_leader_of(group_id)`, …) correctly cannot be
// hoisted and are ignored — a call with a NON-EMPTY argument list never
// matches. The scan replays drop-then-create across all migrations in apply
// order (the repo's own in-force model from
// `lib/admin/__tests__/migration-safety.ts`), so superseded policies don't
// count and a policy recreated without the wrapping fails the build.

const MIGRATIONS = listMigrations().map(loadMigration);

/**
 * Tables still present after replaying `create table` / `drop table` in apply
 * order. `tablesWithRlsEnabled` alone would resurrect the four group-catalog
 * tables dropped by the cell → group-type collapse (20260708000000) — their
 * policies died with the table and cannot be recreated.
 */
function tablesStillPresent(tables: ReadonlySet<string>): Set<string> {
  const alive = new Set(tables);
  const dropRe = /\bdrop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?(\w+)/g;
  const createRe =
    /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)/g;
  const dropped = new Set<string>();
  for (const sql of MIGRATIONS) {
    for (const match of sql.lower.matchAll(dropRe)) dropped.add(match[1]);
    for (const match of sql.lower.matchAll(createRe)) dropped.delete(match[1]);
  }
  for (const table of dropped) alive.delete(table);
  return alive;
}

const RLS_TABLES = [
  ...tablesStillPresent(tablesWithRlsEnabled(MIGRATIONS)),
].sort();

// A no-arg function call in a predicate: `public.helper()` or `auth.uid()`
// with an empty argument list. Predicates are lowercased by the parser.
const NO_ARG_CALL_RE = /\b(?:public|auth)\.[a-z0-9_]+\s*\(\s*\)/g;

// Policies deliberately left bare, keyed `table.policy` — each with a reviewed
// rationale. Do not add entries for convenience; wrapping is the default.
const BARE_ALLOWLIST: ReadonlyMap<string, string> = new Map([
  // The SC.4 adversarial boundary proof (sc4-boundary-proof.test.ts) pins each
  // of these tables to EXACTLY ONE create-policy statement across all
  // migrations with a byte-exact USING clause. Recreating them to add the
  // wrapping would weaken that proof for a negligible win: they are
  // creator-only reads over tiny tables.
  [
    "shepherd_care_private_notes.shepherd_care_private_notes_creator_select",
    "SC.4 boundary proof pins the exact policy text (one statement ever).",
  ],
  [
    "shepherd_care_note_key_slots.shepherd_care_note_key_slots_creator_select",
    "SC.4 boundary proof pins the exact policy text (one statement ever).",
  ],
]);

/**
 * True when the call starting at `index` is already InitPlan-wrapped — i.e.
 * the nearest preceding non-whitespace token is the `select` keyword
 * (`(select public.helper())`, `in (select public.helper())`).
 */
function isWrapped(predicate: string, index: number): boolean {
  const before = predicate.slice(0, index).trimEnd();
  return /\bselect$/.test(before);
}

interface BareCall {
  readonly table: string;
  readonly policy: string;
  readonly call: string;
}

function findBareCalls(): { bare: BareCall[]; totalCalls: number } {
  const bare: BareCall[] = [];
  let totalCalls = 0;
  for (const table of RLS_TABLES) {
    for (const policy of effectiveSelectPolicies(MIGRATIONS, table)) {
      for (const match of policy.predicate.matchAll(NO_ARG_CALL_RE)) {
        totalCalls++;
        if (!isWrapped(policy.predicate, match.index ?? 0)) {
          bare.push({ table, policy: policy.name, call: match[0] });
        }
      }
    }
  }
  return { bare, totalCalls };
}

describe("fitness: no-arg helpers in RLS USING clauses are (select …)-wrapped", () => {
  const { bare, totalCalls } = findBareCalls();

  it("finds RLS tables and policies to scan (guards against a broken glob)", () => {
    expect(MIGRATIONS.length).toBeGreaterThan(0);
    expect(RLS_TABLES.length).toBeGreaterThan(20);
  });

  it("actually inspects a non-trivial number of helper calls (sanity floor)", () => {
    // ~50 in-force SELECT policies call a no-arg helper at least once. A parser
    // regression that silently matched nothing would pass the check vacuously.
    expect(totalCalls).toBeGreaterThan(40);
  });

  it("every no-arg helper call in an in-force SELECT policy is wrapped", () => {
    const offenders = bare
      .filter((b) => !BARE_ALLOWLIST.has(`${b.table}.${b.policy}`))
      .map((b) => `  ${b.table}.${b.policy}: bare ${b.call}`)
      .sort();
    expect(
      offenders,
      offenders.length === 0
        ? ""
        : `These in-force SELECT policies call a no-argument helper bare in ` +
            `USING — Postgres re-executes it per candidate row. Wrap the call ` +
            `as \`(select public.helper())\` so it becomes a once-per-query ` +
            `InitPlan (see 20260714010000_rls_initplan_wrap_noarg_helpers.sql ` +
            `for the pattern), or add a reviewed BARE_ALLOWLIST entry:\n` +
            `${offenders.join("\n")}`
    ).toEqual([]);
  });

  it("every allowlist entry still matches a bare call (no stale exemptions)", () => {
    const bareKeys = new Set(bare.map((b) => `${b.table}.${b.policy}`));
    const stale = [...BARE_ALLOWLIST.keys()].filter(
      (key) => !bareKeys.has(key)
    );
    expect(
      stale,
      stale.length === 0
        ? ""
        : `These BARE_ALLOWLIST entries no longer match any bare call — ` +
            `remove them:\n  ${stale.join("\n  ")}`
    ).toEqual([]);
  });
});
