-- Performance: make Over-Shepherd coverage-scoped read RLS resolve the
-- caller's covered set ONCE per query instead of once per scanned row.
--
-- The OS.3 read policies (profiles / shepherd_care_profiles /
-- shepherd_care_interactions) filtered each candidate row with
-- auth_over_shepherd_covers(<row column>). Because that helper takes the row's
-- id as an argument, Postgres re-evaluates it -- including its
-- auth_over_shepherd_id() resolution and the coverage join -- for EVERY row in
-- the scan. On profiles (read on every authenticated request) that is an
-- O(rows) cost that grows with the directory. This is the same class of lint
-- the perf-RLS InitPlan migration (20260601010000) already addressed for
-- auth.uid().
--
-- Fix: resolve the caller's actively-covered Shepherd profile ids ONCE via a
-- new SECURITY DEFINER set-returning helper, and test membership with
-- `<col> in (select public.over_shepherd_covered_profile_ids())`. The subquery
-- does not reference the outer row, so the planner evaluates it a single time
-- (InitPlan) and hash-semi-joins -- same result, no per-row function call.
--
-- Semantics are preserved EXACTLY. over_shepherd_covered_profile_ids() returns
-- precisely the set of profile ids for which auth_over_shepherd_covers() is
-- true: actively-covered targets that are active leader/co_leader profiles,
-- scoped to the caller's single resolved roster id (auth_over_shepherd_id()
-- null -> empty set -> grants nothing), identical to the OS.6 tightening. So
-- `id in (select ...)` is equivalent to `auth_over_shepherd_covers(id)` for
-- every row, including the no-access and non-over_shepherd cases.
--
-- Keeping the profiles join INSIDE a SECURITY DEFINER function (rather than
-- inlining `select ... from profiles` into the policy) is deliberate: the
-- definer context bypasses RLS on that inner read, avoiding the recursive-RLS
-- trap an inline profiles subquery inside a profiles policy would create.
--
-- auth_over_shepherd_covers() is left defined for back-compat but is no longer
-- on the hot read path. The shepherd_coverage_assignments self-read policy is
-- re-created with auth_over_shepherd_id() wrapped as a scalar subselect so it
-- too resolves once per query. Admin / self / staff policies on these tables
-- are separate permissive policies and are untouched -- nothing is broadened.
-- (docs/adr/0002-oversight-ladder-and-leader-gating.md.)

-- ---------------------------------------------------------------------------
-- Set-returning coverage helper (evaluated once per query)
-- ---------------------------------------------------------------------------
create or replace function public.over_shepherd_covered_profile_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select sca.shepherd_profile_id
    from public.shepherd_coverage_assignments sca
    join public.profiles p
      on p.id = sca.shepherd_profile_id
   where sca.over_shepherd_id = public.auth_over_shepherd_id()
     and sca.active
     and p.role in ('leader'::public.user_role, 'co_leader'::public.user_role)
     and p.status = 'active'::public.profile_status;
$$;

revoke all     on function public.over_shepherd_covered_profile_ids() from public;
revoke all     on function public.over_shepherd_covered_profile_ids() from anon;
grant  execute on function public.over_shepherd_covered_profile_ids() to authenticated;

comment on function public.over_shepherd_covered_profile_ids() is
  'Set of actively-covered active leader/co_leader profile ids for the calling Over-Shepherd (empty when the caller does not resolve to a single active roster row). Set-returning sibling of auth_over_shepherd_covers() for once-per-query RLS membership tests.';

-- ---------------------------------------------------------------------------
-- Re-create the OS.3 coverage-scoped read policies on the set-membership form
-- ---------------------------------------------------------------------------

-- profiles: an Over-Shepherd may read the profile rows of the Shepherds they
-- actively cover. (Self-read + admin/staff read policies are separate
-- permissive policies and are left in place.)
drop policy if exists profiles_over_shepherd_read on public.profiles;
create policy profiles_over_shepherd_read on public.profiles
  for select to authenticated
  using (id in (select public.over_shepherd_covered_profile_ids()));

-- shepherd_care_profiles: scoped to actively-covered Shepherds.
drop policy if exists shepherd_care_profiles_over_shepherd_select
  on public.shepherd_care_profiles;
create policy shepherd_care_profiles_over_shepherd_select
  on public.shepherd_care_profiles
  for select to authenticated
  using (
    shepherd_profile_id in (select public.over_shepherd_covered_profile_ids())
  );

-- shepherd_care_interactions: scoped via the parent care profile's Shepherd.
-- The EXISTS still correlates only on the (indexed) care_profile_id PK; the
-- coverage set is resolved once by the set-returning helper instead of a
-- per-row auth_over_shepherd_covers() call.
drop policy if exists shepherd_care_interactions_over_shepherd_select
  on public.shepherd_care_interactions;
create policy shepherd_care_interactions_over_shepherd_select
  on public.shepherd_care_interactions
  for select to authenticated
  using (
    exists (
      select 1
        from public.shepherd_care_profiles scp
       where scp.id = shepherd_care_interactions.care_profile_id
         and scp.shepherd_profile_id in (
           select public.over_shepherd_covered_profile_ids()
         )
    )
  );

-- shepherd_coverage_assignments: an Over-Shepherd reads only their OWN active
-- assignments. Wrap auth_over_shepherd_id() in a scalar subselect so it is
-- evaluated once per query (InitPlan) rather than once per row.
drop policy if exists shepherd_coverage_assignments_over_shepherd_select
  on public.shepherd_coverage_assignments;
create policy shepherd_coverage_assignments_over_shepherd_select
  on public.shepherd_coverage_assignments
  for select to authenticated
  using (
    over_shepherd_id = (select public.auth_over_shepherd_id())
    and active
  );
