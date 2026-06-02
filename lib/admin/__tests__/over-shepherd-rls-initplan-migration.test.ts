import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

// Static boundary assertions over the Over-Shepherd RLS InitPlan optimization.
// CI has no Postgres, so these string assertions are the CI-runnable regression
// guard for the security-critical invariant that the coverage-scoped read
// policies still grant nothing beyond the caller's actively-covered set after
// the per-row -> once-per-query rewrite.

const MIGRATION_PATH = fileURLToPath(
  new URL(
    "../../../supabase/migrations/20260602010000_perf_over_shepherd_rls_initplan.sql",
    import.meta.url
  )
);

let sql = "";
const lower = () => sql.toLowerCase();
// SQL with `-- ...` comment lines stripped, so assertions about what the
// executable statements do aren't fooled by the explanatory header prose
// (which legitimately names the old per-row helper when describing the swap).
const lowerCode = () =>
  sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .toLowerCase();

beforeAll(() => {
  sql = readFileSync(MIGRATION_PATH, "utf8");
});

describe("Over-Shepherd RLS InitPlan migration", () => {
  it("defines the set-returning coverage helper as SECURITY DEFINER with a pinned search_path", () => {
    expect(lower()).toContain(
      "create or replace function public.over_shepherd_covered_profile_ids()"
    );
    const fn = lower().slice(
      lower().indexOf("over_shepherd_covered_profile_ids()")
    );
    expect(fn).toContain("returns setof uuid");
    expect(fn).toContain("security definer");
    expect(fn).toContain("stable");
    expect(fn).toContain("set search_path = public");
  });

  it("keeps the coverage fence: active assignment + active leader/co_leader target, scoped to the caller's roster id", () => {
    const fn = lower().slice(
      lower().indexOf(
        "create or replace function public.over_shepherd_covered_profile_ids()"
      )
    );
    expect(fn).toContain("over_shepherd_id = public.auth_over_shepherd_id()");
    expect(fn).toContain("sca.active");
    expect(fn).toContain("'leader'::public.user_role");
    expect(fn).toContain("'co_leader'::public.user_role");
    expect(fn).toContain("p.status = 'active'::public.profile_status");
  });

  it("locks the helper's EXECUTE down to authenticated only", () => {
    expect(lower()).toContain(
      "revoke all     on function public.over_shepherd_covered_profile_ids() from public"
    );
    expect(lower()).toContain(
      "revoke all     on function public.over_shepherd_covered_profile_ids() from anon"
    );
    expect(lower()).toContain(
      "grant  execute on function public.over_shepherd_covered_profile_ids() to authenticated"
    );
  });

  it("routes all three coverage-scoped read policies through the once-per-query set helper", () => {
    // profiles
    expect(lower()).toContain(
      "create policy profiles_over_shepherd_read on public.profiles"
    );
    expect(lower()).toContain(
      "id in (select public.over_shepherd_covered_profile_ids())"
    );
    // shepherd_care_profiles
    expect(lower()).toContain(
      "create policy shepherd_care_profiles_over_shepherd_select"
    );
    expect(lower()).toContain(
      "shepherd_profile_id in (select public.over_shepherd_covered_profile_ids())"
    );
    // shepherd_care_interactions (scoped via the parent care profile)
    expect(lower()).toContain(
      "create policy shepherd_care_interactions_over_shepherd_select"
    );
    expect(lower()).toContain(
      "scp.id = shepherd_care_interactions.care_profile_id"
    );
  });

  it("re-creates policies (drop if exists + create) rather than broadening them", () => {
    expect(lower()).toContain(
      "drop policy if exists profiles_over_shepherd_read on public.profiles"
    );
    expect(lower()).toContain(
      "drop policy if exists shepherd_care_profiles_over_shepherd_select"
    );
    expect(lower()).toContain(
      "drop policy if exists shepherd_care_interactions_over_shepherd_select"
    );
    expect(lower()).toContain(
      "drop policy if exists shepherd_coverage_assignments_over_shepherd_select"
    );
  });

  it("scopes the coverage-assignment self-read to the caller's own active rows via an InitPlan subselect", () => {
    expect(lower()).toContain(
      "over_shepherd_id = (select public.auth_over_shepherd_id())"
    );
  });

  it("does not call the per-row coverage predicate inside any policy using-clause", () => {
    // The whole point of the rewrite: the hot read policies no longer call
    // auth_over_shepherd_covers(<row col>) per scanned row. We check the
    // executable statements only — the header prose and the COMMENT ON literal
    // legitimately name the old helper when describing the swap.
    const usingClauses = lowerCode()
      .split("create policy")
      .slice(1)
      .map((chunk) => chunk.slice(0, chunk.indexOf(");") + 1));
    for (const clause of usingClauses) {
      expect(clause).not.toContain("auth_over_shepherd_covers(");
    }
  });
});
