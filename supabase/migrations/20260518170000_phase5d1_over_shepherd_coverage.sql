-- Phase 5D.1: Over-shepherd coverage tracking (SC.2).
--
-- Builds on SC.1A (20260518160000_phase5d0_shepherd_care_foundation.sql).
-- Lets Julian record which over-shepherd / coach covers which Life or
-- Co-Life Shepherd. Admin-only — no over-shepherd app login is added in
-- this slice. Over-shepherds are stored as non-auth records.
--
-- Two tables only in this slice:
--   * over_shepherds                   — non-auth roster of coaches /
--                                        over-shepherds Julian manages.
--                                        Soft-archivable; never hard-deleted.
--   * shepherd_coverage_assignments    — joins a leader/co_leader profile
--                                        to one active over-shepherd at a
--                                        time. Soft-end via active=false +
--                                        ended_at. Never hard-deleted.
--
-- Privacy posture matches SC.1A:
--   * RLS SELECT uses public.auth_is_admin(), NOT
--     public.auth_is_admin_or_staff(). staff_viewer must never see
--     coverage data.
--   * NO insert/update/delete policies on either table. All writes go
--     through SECURITY DEFINER RPCs that gate on auth_is_admin() inside
--     the function body and write the matching audit_events row in the
--     same transaction.
--   * over_shepherds.notes (free-form admin context) is NEVER stored in
--     audit_events metadata. We record presence flags only — same rule
--     as shepherd_care_profiles.admin_summary.
--
-- Fixed error tokens raised by these functions (mapped to friendly
-- messages by lib/admin/action-result.ts):
--   insufficient_privilege, invalid_input, missing_profile,
--   missing_over_shepherd, inactive_over_shepherd, missing_assignment.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.over_shepherds (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint over_shepherds_full_name_length check (
    char_length(btrim(full_name)) between 1 and 200
  ),
  constraint over_shepherds_notes_length check (
    notes is null or char_length(notes) <= 2000
  )
);

comment on table public.over_shepherds is
  'Phase 5D.1 admin-only roster of over-shepherds / coaches. Non-auth records — these people do not log in. Writes only via SECURITY DEFINER RPCs.';
comment on column public.over_shepherds.notes is
  'Plain text admin-only notes about the over-shepherd. NEVER written to audit_events metadata.';

create table public.shepherd_coverage_assignments (
  id uuid primary key default gen_random_uuid(),
  shepherd_profile_id uuid not null references public.profiles(id) on delete restrict,
  over_shepherd_id uuid not null references public.over_shepherds(id) on delete restrict,
  active boolean not null default true,
  assigned_at date not null default current_date,
  ended_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.shepherd_coverage_assignments is
  'Phase 5D.1 active + historical coverage assignments linking a leader/co_leader profile to one active over-shepherd at a time. Soft-end via active=false + ended_at. No hard deletes.';

create index idx_over_shepherds_active_full_name
  on public.over_shepherds (active, full_name);

create index idx_shepherd_coverage_assignments_shepherd_active
  on public.shepherd_coverage_assignments (shepherd_profile_id, active);
create index idx_shepherd_coverage_assignments_over_shepherd_active
  on public.shepherd_coverage_assignments (over_shepherd_id, active);

-- Partial unique: at most one active assignment per shepherd. Soft-ended
-- rows (active=false) are excluded so the same shepherd can be reassigned
-- after their prior assignment is closed. Mirrors the pattern from
-- 20260518140000_phase5a6_group_calendar.sql.
create unique index shepherd_coverage_assignments_one_active_per_shepherd
  on public.shepherd_coverage_assignments (shepherd_profile_id)
  where active = true;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Admin-only SELECT, mirroring SC.1A. staff_viewer must NOT read coverage
-- data. No INSERT/UPDATE/DELETE policies — writes only via SECURITY
-- DEFINER RPCs declared below.

alter table public.over_shepherds enable row level security;
alter table public.shepherd_coverage_assignments enable row level security;

create policy over_shepherds_admin_select
  on public.over_shepherds
  for select to authenticated using (public.auth_is_admin());

create policy shepherd_coverage_assignments_admin_select
  on public.shepherd_coverage_assignments
  for select to authenticated using (public.auth_is_admin());

grant select on public.over_shepherds                  to authenticated;
grant select on public.shepherd_coverage_assignments   to authenticated;

-- ---------------------------------------------------------------------------
-- 1. admin_create_over_shepherd
-- ---------------------------------------------------------------------------
-- Creates a non-auth over-shepherd record. Notes body is NEVER stored in
-- audit metadata — only a presence flag.
create or replace function public.admin_create_over_shepherd(
  p_full_name text,
  p_email text,
  p_phone text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_full_name text;
  v_email text;
  v_phone text;
  v_notes text;
  v_new_id uuid;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  v_full_name := nullif(btrim(coalesce(p_full_name, '')), '');
  if v_full_name is null or char_length(v_full_name) > 200 then
    raise exception 'invalid_input';
  end if;

  v_email := nullif(btrim(coalesce(p_email, '')), '');
  v_phone := nullif(btrim(coalesce(p_phone, '')), '');
  v_notes := nullif(btrim(coalesce(p_notes, '')), '');
  if v_notes is not null and char_length(v_notes) > 2000 then
    raise exception 'invalid_input';
  end if;

  insert into public.over_shepherds (full_name, email, phone, notes)
  values (v_full_name, v_email, v_phone, v_notes)
  returning id into v_new_id;

  -- Notes body intentionally NOT stored. Presence flags only.
  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.create_over_shepherd',
    'over_shepherds',
    v_new_id,
    jsonb_build_object(
      'after', jsonb_build_object(
        'full_name', v_full_name,
        'has_email', v_email is not null,
        'has_phone', v_phone is not null,
        'has_notes', v_notes is not null,
        'active', true
      )
    )
  );

  return v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. admin_update_over_shepherd
-- ---------------------------------------------------------------------------
-- Updates an existing over_shepherds row. Soft archive/restore via the
-- active flag — never hard-deletes. Notes body is NEVER stored in audit
-- metadata.
create or replace function public.admin_update_over_shepherd(
  p_over_shepherd_id uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_notes text,
  p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_existing record;
  v_full_name text;
  v_email text;
  v_phone text;
  v_notes text;
  v_active boolean;
  v_archived_at timestamptz;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_over_shepherd_id is null then
    raise exception 'invalid_input';
  end if;

  v_full_name := nullif(btrim(coalesce(p_full_name, '')), '');
  if v_full_name is null or char_length(v_full_name) > 200 then
    raise exception 'invalid_input';
  end if;

  v_email := nullif(btrim(coalesce(p_email, '')), '');
  v_phone := nullif(btrim(coalesce(p_phone, '')), '');
  v_notes := nullif(btrim(coalesce(p_notes, '')), '');
  if v_notes is not null and char_length(v_notes) > 2000 then
    raise exception 'invalid_input';
  end if;
  if p_active is null then
    raise exception 'invalid_input';
  end if;
  v_active := p_active;

  select id, full_name, email, phone, notes, active, archived_at
    into v_existing
    from public.over_shepherds
   where id = p_over_shepherd_id
   for update;
  if v_existing.id is null then
    raise exception 'missing_over_shepherd';
  end if;

  -- Soft archive/restore: archived_at is the timestamp source of truth
  -- for "when did this become inactive?" so the directory can show
  -- recency without a separate event log.
  if v_active and v_existing.active is not true then
    v_archived_at := null;
  elsif v_active = false and v_existing.active = true then
    v_archived_at := now();
  else
    v_archived_at := v_existing.archived_at;
  end if;

  update public.over_shepherds
     set full_name = v_full_name,
         email = v_email,
         phone = v_phone,
         notes = v_notes,
         active = v_active,
         archived_at = v_archived_at,
         updated_at = now()
   where id = p_over_shepherd_id;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.update_over_shepherd',
    'over_shepherds',
    p_over_shepherd_id,
    jsonb_build_object(
      'before', jsonb_build_object(
        'full_name', v_existing.full_name,
        'has_email', v_existing.email is not null,
        'has_phone', v_existing.phone is not null,
        'has_notes', v_existing.notes is not null,
        'active', v_existing.active
      ),
      'after', jsonb_build_object(
        'full_name', v_full_name,
        'has_email', v_email is not null,
        'has_phone', v_phone is not null,
        'has_notes', v_notes is not null,
        'active', v_active
      )
    )
  );

  return p_over_shepherd_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. admin_assign_shepherd_to_over_shepherd
-- ---------------------------------------------------------------------------
-- Assigns a shepherd (leader/co_leader profile) to an over-shepherd. Ends
-- any current active assignment for the shepherd in the same transaction,
-- so a reassignment is atomic. The partial unique index protects against
-- races (concurrent inserts will conflict and one transaction errors out).
create or replace function public.admin_assign_shepherd_to_over_shepherd(
  p_shepherd_profile_id uuid,
  p_over_shepherd_id uuid,
  p_assigned_at date
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_target record;
  v_over_shepherd record;
  v_assigned_at date;
  v_ended_assignment_id uuid;
  v_ended_over_shepherd_id uuid;
  v_new_id uuid;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_shepherd_profile_id is null or p_over_shepherd_id is null then
    raise exception 'invalid_input';
  end if;
  v_assigned_at := coalesce(p_assigned_at, current_date);

  -- Same target gating as SC.1A: only active leader/co_leader profiles
  -- are eligible coverage subjects.
  select id, role, status
    into v_target
    from public.profiles
   where id = p_shepherd_profile_id
   limit 1;
  if v_target.id is null then
    raise exception 'missing_profile';
  end if;
  if v_target.role not in ('leader'::public.user_role, 'co_leader'::public.user_role) then
    raise exception 'missing_profile';
  end if;
  if v_target.status <> 'active'::public.profile_status then
    raise exception 'missing_profile';
  end if;

  select id, active
    into v_over_shepherd
    from public.over_shepherds
   where id = p_over_shepherd_id
   limit 1;
  if v_over_shepherd.id is null then
    raise exception 'missing_over_shepherd';
  end if;
  if v_over_shepherd.active is not true then
    raise exception 'inactive_over_shepherd';
  end if;

  -- End any current active assignment for this shepherd. Captured ids
  -- flow into the audit row so a reviewer can see the prior coverage at
  -- a glance.
  update public.shepherd_coverage_assignments
     set active = false,
         ended_at = v_assigned_at,
         updated_at = now()
   where shepherd_profile_id = p_shepherd_profile_id
     and active = true
  returning id, over_shepherd_id
       into v_ended_assignment_id, v_ended_over_shepherd_id;

  insert into public.shepherd_coverage_assignments (
    shepherd_profile_id, over_shepherd_id, active, assigned_at
  ) values (
    p_shepherd_profile_id, p_over_shepherd_id, true, v_assigned_at
  )
  returning id into v_new_id;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.assign_shepherd_coverage',
    'shepherd_coverage_assignments',
    v_new_id,
    jsonb_build_object(
      'shepherd_profile_id', p_shepherd_profile_id,
      'over_shepherd_id', p_over_shepherd_id,
      'assigned_at', v_assigned_at,
      'replaced_assignment_id', v_ended_assignment_id,
      'replaced_over_shepherd_id', v_ended_over_shepherd_id
    )
  );

  return v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. admin_end_shepherd_coverage_assignment
-- ---------------------------------------------------------------------------
-- Soft-ends an active assignment. Idempotent guard: ending an already-
-- inactive assignment raises missing_assignment so the UI can refresh.
create or replace function public.admin_end_shepherd_coverage_assignment(
  p_assignment_id uuid,
  p_ended_at date
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_existing record;
  v_ended_at date;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_assignment_id is null then
    raise exception 'invalid_input';
  end if;
  v_ended_at := coalesce(p_ended_at, current_date);

  select id, shepherd_profile_id, over_shepherd_id, active
    into v_existing
    from public.shepherd_coverage_assignments
   where id = p_assignment_id
   for update;
  if v_existing.id is null or v_existing.active is not true then
    raise exception 'missing_assignment';
  end if;

  update public.shepherd_coverage_assignments
     set active = false,
         ended_at = v_ended_at,
         updated_at = now()
   where id = p_assignment_id;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.end_shepherd_coverage',
    'shepherd_coverage_assignments',
    p_assignment_id,
    jsonb_build_object(
      'shepherd_profile_id', v_existing.shepherd_profile_id,
      'over_shepherd_id', v_existing.over_shepherd_id,
      'ended_at', v_ended_at
    )
  );

  return p_assignment_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Revoke from public/anon/authenticated, then grant execute to
-- authenticated only. Function bodies still enforce auth_is_admin().
-- ---------------------------------------------------------------------------

revoke all on function public.admin_create_over_shepherd(text, text, text, text) from public;
revoke all on function public.admin_create_over_shepherd(text, text, text, text) from anon;
revoke all on function public.admin_create_over_shepherd(text, text, text, text) from authenticated;
grant execute on function public.admin_create_over_shepherd(text, text, text, text) to authenticated;

revoke all on function public.admin_update_over_shepherd(uuid, text, text, text, text, boolean) from public;
revoke all on function public.admin_update_over_shepherd(uuid, text, text, text, text, boolean) from anon;
revoke all on function public.admin_update_over_shepherd(uuid, text, text, text, text, boolean) from authenticated;
grant execute on function public.admin_update_over_shepherd(uuid, text, text, text, text, boolean) to authenticated;

revoke all on function public.admin_assign_shepherd_to_over_shepherd(uuid, uuid, date) from public;
revoke all on function public.admin_assign_shepherd_to_over_shepherd(uuid, uuid, date) from anon;
revoke all on function public.admin_assign_shepherd_to_over_shepherd(uuid, uuid, date) from authenticated;
grant execute on function public.admin_assign_shepherd_to_over_shepherd(uuid, uuid, date) to authenticated;

revoke all on function public.admin_end_shepherd_coverage_assignment(uuid, date) from public;
revoke all on function public.admin_end_shepherd_coverage_assignment(uuid, date) from anon;
revoke all on function public.admin_end_shepherd_coverage_assignment(uuid, date) from authenticated;
grant execute on function public.admin_end_shepherd_coverage_assignment(uuid, date) to authenticated;

comment on function public.admin_create_over_shepherd(text, text, text, text) is
  'Phase 5D.1 admin write: inserts a non-auth over_shepherds row plus an audit_events row. Notes body is NOT stored in audit metadata.';
comment on function public.admin_update_over_shepherd(uuid, text, text, text, text, boolean) is
  'Phase 5D.1 admin write: updates an over_shepherds row (soft archive via active flag) plus an audit_events row with before/after presence flags. Notes body is NOT stored in audit metadata.';
comment on function public.admin_assign_shepherd_to_over_shepherd(uuid, uuid, date) is
  'Phase 5D.1 admin write: ends any current active assignment for the shepherd, inserts a new active assignment, and writes an audit_events row capturing replaced_assignment_id when applicable.';
comment on function public.admin_end_shepherd_coverage_assignment(uuid, date) is
  'Phase 5D.1 admin write: soft-ends an active assignment (active=false + ended_at) and writes an audit_events row.';
