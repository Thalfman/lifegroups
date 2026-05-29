-- Phase OS.2: Over-Shepherd login bridge.
--
-- The `over_shepherds` roster is non-auth coverage data with no link to
-- profiles / auth. This migration bridges a logged-in over_shepherd profile
-- to its single active roster row (matched by email) and resolves the set of
-- Shepherds it actively covers, per
-- docs/adr/0002-oversight-ladder-and-leader-gating.md.
--
-- All three helpers mirror the existing auth_*() pattern from the Phase 4 RLS
-- migration: language sql, security definer, stable, set search_path = public,
-- strictly read-only (no writes, no audit — this is a read path). They are the
-- row-scoping foundation the later Over-Shepherd read/write slices build on.

-- ---------------------------------------------------------------------------
-- auth_over_shepherd_id() — caller's single active roster id (RLS-facing)
-- ---------------------------------------------------------------------------
-- Resolves the calling profile to exactly one active over_shepherds row,
-- matched case-insensitively by email.
--
-- Email-collision policy (decision baked in): require EXACTLY ONE active
-- match. Zero matches or an ambiguous (>1) active match resolve to no-access
-- (null) rather than guessing — we never multi-match. Only a caller whose
-- active profile role is 'over_shepherd' can resolve, so an email collision
-- on a different role can never bridge into coverage scope.
create or replace function public.auth_over_shepherd_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  with caller as (
    select lower(btrim(p.email)) as email
      from public.profiles p
     where p.auth_user_id = auth.uid()
       and p.status = 'active'
       and p.role = 'over_shepherd'
       and p.email is not null
       and btrim(p.email) <> ''
     limit 1
  ),
  matches as (
    select os.id
      from public.over_shepherds os
      join caller c
        on lower(btrim(os.email)) = c.email
     where os.active
       and os.email is not null
  )
  select case
           when (select count(*) from matches) = 1
             then (select id from matches limit 1)
           else null
         end;
$$;

-- ---------------------------------------------------------------------------
-- auth_over_shepherd_covers(uuid) — coverage predicate (RLS-facing)
-- ---------------------------------------------------------------------------
-- True iff the current over-shepherd actively covers the given Shepherd
-- profile id. Coverage is derived ONLY from active = true assignments, so an
-- ended / inactive assignment grants nothing. If the caller does not resolve
-- to a single active roster row (auth_over_shepherd_id() is null), the
-- comparison matches no rows and the predicate is false.
create or replace function public.auth_over_shepherd_covers(p_shepherd_profile_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
      from public.shepherd_coverage_assignments sca
     where sca.over_shepherd_id = public.auth_over_shepherd_id()
       and sca.shepherd_profile_id = p_shepherd_profile_id
       and sca.active
  );
$$;

-- ---------------------------------------------------------------------------
-- over_shepherd_caller_coverage() — identity + coverage set for the read layer
-- ---------------------------------------------------------------------------
-- Returns the caller's over-shepherd identity plus its actively-covered
-- Shepherd profile ids as jsonb, or NULL when the caller has no access (zero
-- or ambiguous roster match). SECURITY DEFINER so the app read layer can
-- resolve coverage before the coverage-scoped SELECT RLS (a later slice)
-- exists. Read-only.
create or replace function public.over_shepherd_caller_coverage()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  with me as (select public.auth_over_shepherd_id() as id)
  select case
    when (select id from me) is null then null
    else jsonb_build_object(
      'over_shepherd_id', (select id from me),
      'covered_shepherd_ids', coalesce(
        (
          select jsonb_agg(sca.shepherd_profile_id order by sca.shepherd_profile_id)
            from public.shepherd_coverage_assignments sca
           where sca.over_shepherd_id = (select id from me)
             and sca.active
        ),
        '[]'::jsonb
      )
    )
  end;
$$;

-- Lock down execution to authenticated callers only (mirrors the Phase 4
-- auth_*() grants). Scoped policies in later slices invoke these helpers;
-- anon never reaches them.
revoke all on function public.auth_over_shepherd_id() from public;
revoke all on function public.auth_over_shepherd_covers(uuid) from public;
revoke all on function public.over_shepherd_caller_coverage() from public;

grant execute on function public.auth_over_shepherd_id() to authenticated;
grant execute on function public.auth_over_shepherd_covers(uuid) to authenticated;
grant execute on function public.over_shepherd_caller_coverage() to authenticated;
