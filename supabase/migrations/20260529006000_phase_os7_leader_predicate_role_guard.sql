-- Phase OS.7: require the caller to actually be a leader in auth_is_leader_of().
--
-- Codex review (round 2), New-B: enabling leader -> over_shepherd via the
-- role-change surface (phase_os4) exposed a stale-grant hole. Converting a
-- leader only updates profiles.role; it does not cascade their active
-- group_leaders rows. auth_is_leader_of() granted leader-scoped RLS purely
-- from those active group_leaders rows (checking the group_leaders.role, not
-- the caller's profiles.role), so a converted Over-Shepherd kept direct
-- PostgREST read access to their old group / member / follow-up rows, outside
-- the coverage-scoped /over-shepherd surface.
--
-- Fix the predicate at the source: also require the CALLER's profile role to be
-- leader/co_leader (via auth_role()). This revokes leader-scoped RLS the moment
-- a profile is moved off leader/co_leader (to over_shepherd, ministry_admin,
-- staff_viewer, ...), regardless of any stale group_leaders rows, and is the
-- general fix for every such conversion — not just the over_shepherd case.
--
-- Behavior is unchanged for real leaders (their profiles.role is still
-- leader/co_leader), so the dormant leader surface stays exactly as restorable
-- as before. auth_profile_id() continues to enforce status = 'active', so the
-- active-status guard is unchanged. CREATE OR REPLACE preserves grants.
-- (docs/adr/0002-oversight-ladder-and-leader-gating.md.)

create or replace function public.auth_is_leader_of(p_group_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  -- auth_profile_id() already filters on profiles.status = 'active', so
  -- deactivated users automatically lose leader-scoped access. The
  -- auth_role() guard additionally requires the caller's CURRENT profile role
  -- to be a leadership role, so a profile converted away from leader/co_leader
  -- loses access even while stale active group_leaders rows linger. The
  -- gl.role filter still guards against a non-leader row ever being inserted
  -- into group_leaders (the column type allows the broader role_in_group enum).
  select
    public.auth_role() in ('leader'::public.user_role, 'co_leader'::public.user_role)
    and exists (
      select 1 from public.group_leaders gl
      where gl.group_id = p_group_id
        and gl.active
        and gl.role in ('leader', 'co_leader')
        and gl.profile_id = public.auth_profile_id()
    );
$$;
