-- Phase OS.6: scope Over-Shepherd coverage to eligible (active leader/co_leader)
-- targets.
--
-- Codex review (round 2) on PR #106: the OS.2 coverage helpers keyed only on
-- `sca.active`, so a coverage assignment whose target profile is later moved
-- off leader/co_leader or deactivated still resolved as "covered". Role-change
-- RPCs do not cascade shepherd_coverage_assignments (the admin read models
-- already note this and filter joined profiles.role/status), so an
-- Over-Shepherd could keep reading a former Shepherd's profile + care history
-- through the OS.3 coverage-scoped policies.
--
-- Fix the predicate at the source: require the covered target to be an ACTIVE
-- leader/co_leader. Because every OS.3 read policy (profiles, care profile,
-- care interactions) routes through auth_over_shepherd_covers(), and the app
-- read layer routes through over_shepherd_caller_coverage(), tightening these
-- two helpers fences all of them at once — no per-policy join needed.
-- CREATE OR REPLACE preserves the existing EXECUTE grants.
-- (docs/adr/0002-oversight-ladder-and-leader-gating.md.)

-- auth_over_shepherd_covers(uuid): true iff the caller actively covers the
-- given profile AND that profile is an active leader/co_leader.
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
      join public.profiles p
        on p.id = sca.shepherd_profile_id
     where sca.over_shepherd_id = public.auth_over_shepherd_id()
       and sca.shepherd_profile_id = p_shepherd_profile_id
       and sca.active
       and p.role in ('leader'::public.user_role, 'co_leader'::public.user_role)
       and p.status = 'active'::public.profile_status
  );
$$;

-- over_shepherd_caller_coverage(): identity + the actively-covered Shepherd ids
-- for the read layer, now likewise filtered to active leader/co_leader targets
-- so a stale assignment never enters the app's coverage scope.
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
            join public.profiles p
              on p.id = sca.shepherd_profile_id
           where sca.over_shepherd_id = (select id from me)
             and sca.active
             and p.role in ('leader'::public.user_role, 'co_leader'::public.user_role)
             and p.status = 'active'::public.profile_status
        ),
        '[]'::jsonb
      )
    )
  end;
$$;
