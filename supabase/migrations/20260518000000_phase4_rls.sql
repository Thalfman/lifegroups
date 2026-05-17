-- Phase 4: Row Level Security foundation.
--
-- Goals:
--   * No unauthenticated public reads on operational tables.
--   * Ministry admins (super_admin, ministry_admin) read all operational data.
--   * Staff viewers read ministry-wide operational data (no writes).
--   * Leaders / co-leaders read only data scoped to their active group assignments.
--
-- This migration intentionally introduces NO insert / update / delete policies.
-- Write workflows (attendance submission, guest capture, follow-up actions,
-- admin review queues) land in Phase 5 once read scoping is verified.

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------

create or replace function public.auth_profile_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id
    from public.profiles
   where auth_user_id = auth.uid()
     and status = 'active'
   limit 1;
$$;

create or replace function public.auth_role()
returns public.user_role
language sql
security definer
stable
set search_path = public
as $$
  select role
    from public.profiles
   where auth_user_id = auth.uid()
     and status = 'active'
   limit 1;
$$;

create or replace function public.auth_is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(public.auth_role() in ('super_admin','ministry_admin'), false);
$$;

create or replace function public.auth_is_staff_viewer()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(public.auth_role() = 'staff_viewer', false);
$$;

create or replace function public.auth_is_admin_or_staff()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(public.auth_role() in ('super_admin','ministry_admin','staff_viewer'), false);
$$;

create or replace function public.auth_is_leader_of(p_group_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  -- auth_profile_id() already filters on profiles.status = 'active',
  -- so deactivated users automatically lose leader-scoped access.
  -- Restrict to actual leadership roles in case a non-leader row is ever
  -- inserted into group_leaders (the column type allows the broader
  -- role_in_group enum, including 'member').
  select exists (
    select 1 from public.group_leaders gl
    where gl.group_id = p_group_id
      and gl.active
      and gl.role in ('leader', 'co_leader')
      and gl.profile_id = public.auth_profile_id()
  );
$$;

revoke all on function public.auth_profile_id() from public;
revoke all on function public.auth_role() from public;
revoke all on function public.auth_is_admin() from public;
revoke all on function public.auth_is_staff_viewer() from public;
revoke all on function public.auth_is_admin_or_staff() from public;
revoke all on function public.auth_is_leader_of(uuid) from public;

grant execute on function public.auth_profile_id() to authenticated;
grant execute on function public.auth_role() to authenticated;
grant execute on function public.auth_is_admin() to authenticated;
grant execute on function public.auth_is_staff_viewer() to authenticated;
grant execute on function public.auth_is_admin_or_staff() to authenticated;
grant execute on function public.auth_is_leader_of(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- profiles
-- All read policies below are scoped `to authenticated`. Without that clause,
-- policies apply to PUBLIC (including the anon role), which would invoke the
-- helper functions above — but those are only granted to `authenticated`,
-- producing `permission denied for function ...` instead of a clean zero-row
-- deny. Anon callers fall through to the default "no policy matches" deny,
-- which is exactly what we want.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

-- Self read uses auth.uid() directly to avoid recursion through auth_profile_id().
create policy profiles_self_read on public.profiles
  for select to authenticated using (auth_user_id = auth.uid());

create policy profiles_admin_staff_read on public.profiles
  for select to authenticated using (public.auth_is_admin_or_staff());

-- ---------------------------------------------------------------------------
-- groups
-- ---------------------------------------------------------------------------
alter table public.groups enable row level security;

create policy groups_admin_staff_read on public.groups
  for select to authenticated using (public.auth_is_admin_or_staff());

create policy groups_leader_read on public.groups
  for select to authenticated using (public.auth_is_leader_of(id));

-- ---------------------------------------------------------------------------
-- group_leaders
-- ---------------------------------------------------------------------------
alter table public.group_leaders enable row level security;

create policy group_leaders_admin_staff_read on public.group_leaders
  for select to authenticated using (public.auth_is_admin_or_staff());

create policy group_leaders_self_read on public.group_leaders
  for select to authenticated using (profile_id = public.auth_profile_id());

create policy group_leaders_peer_read on public.group_leaders
  for select to authenticated using (public.auth_is_leader_of(group_id));

-- ---------------------------------------------------------------------------
-- members
-- Leaders see only members with an active membership in one of their groups.
-- ---------------------------------------------------------------------------
alter table public.members enable row level security;

create policy members_admin_staff_read on public.members
  for select to authenticated using (public.auth_is_admin_or_staff());

create policy members_leader_read on public.members
  for select to authenticated using (
    exists (
      select 1
      from public.group_memberships gm
      where gm.member_id = members.id
        and gm.status = 'active'
        and public.auth_is_leader_of(gm.group_id)
    )
  );

-- ---------------------------------------------------------------------------
-- group_memberships
-- ---------------------------------------------------------------------------
alter table public.group_memberships enable row level security;

create policy group_memberships_admin_staff_read on public.group_memberships
  for select to authenticated using (public.auth_is_admin_or_staff());

create policy group_memberships_leader_read on public.group_memberships
  for select to authenticated using (public.auth_is_leader_of(group_id));

-- ---------------------------------------------------------------------------
-- attendance_sessions
-- ---------------------------------------------------------------------------
alter table public.attendance_sessions enable row level security;

create policy attendance_sessions_admin_staff_read on public.attendance_sessions
  for select to authenticated using (public.auth_is_admin_or_staff());

create policy attendance_sessions_leader_read on public.attendance_sessions
  for select to authenticated using (public.auth_is_leader_of(group_id));

-- ---------------------------------------------------------------------------
-- attendance_records (no group_id column; gate via the parent session).
-- ---------------------------------------------------------------------------
alter table public.attendance_records enable row level security;

create policy attendance_records_admin_staff_read on public.attendance_records
  for select to authenticated using (public.auth_is_admin_or_staff());

create policy attendance_records_leader_read on public.attendance_records
  for select to authenticated using (
    exists (
      select 1
      from public.attendance_sessions s
      where s.id = attendance_records.session_id
        and public.auth_is_leader_of(s.group_id)
    )
  );

-- ---------------------------------------------------------------------------
-- guests
-- Leaders see guests tied to their group via first attended or assigned group.
-- ---------------------------------------------------------------------------
alter table public.guests enable row level security;

create policy guests_admin_staff_read on public.guests
  for select to authenticated using (public.auth_is_admin_or_staff());

create policy guests_leader_read on public.guests
  for select to authenticated using (
    (first_attended_group_id is not null and public.auth_is_leader_of(first_attended_group_id))
    or (assigned_group_id is not null and public.auth_is_leader_of(assigned_group_id))
  );

-- ---------------------------------------------------------------------------
-- follow_ups
-- Leaders see follow-ups for their groups or follow-ups assigned to them.
-- ---------------------------------------------------------------------------
alter table public.follow_ups enable row level security;

create policy follow_ups_admin_staff_read on public.follow_ups
  for select to authenticated using (public.auth_is_admin_or_staff());

create policy follow_ups_leader_read on public.follow_ups
  for select to authenticated using (
    (related_group_id is not null and public.auth_is_leader_of(related_group_id))
    or assigned_to = public.auth_profile_id()
  );

-- ---------------------------------------------------------------------------
-- group_health_updates
-- ---------------------------------------------------------------------------
alter table public.group_health_updates enable row level security;

create policy group_health_updates_admin_staff_read on public.group_health_updates
  for select to authenticated using (public.auth_is_admin_or_staff());

create policy group_health_updates_leader_read on public.group_health_updates
  for select to authenticated using (public.auth_is_leader_of(group_id));

-- ---------------------------------------------------------------------------
-- group_status_history
-- ---------------------------------------------------------------------------
alter table public.group_status_history enable row level security;

create policy group_status_history_admin_staff_read on public.group_status_history
  for select to authenticated using (public.auth_is_admin_or_staff());

create policy group_status_history_leader_read on public.group_status_history
  for select to authenticated using (public.auth_is_leader_of(group_id));

-- ---------------------------------------------------------------------------
-- audit_events: admin only.
-- ---------------------------------------------------------------------------
alter table public.audit_events enable row level security;

create policy audit_events_admin_read on public.audit_events
  for select to authenticated using (public.auth_is_admin());

-- ---------------------------------------------------------------------------
-- app_settings: any authenticated user can read.
-- ---------------------------------------------------------------------------
alter table public.app_settings enable row level security;

create policy app_settings_auth_read on public.app_settings
  for select to authenticated using (auth.uid() is not null);

-- ---------------------------------------------------------------------------
-- No insert / update / delete policies are created in Phase 4. Write workflows
-- (attendance submission, guest capture, follow-up actions, admin review
-- queues) ship in Phase 5 once read scoping is verified end-to-end.
-- ---------------------------------------------------------------------------
