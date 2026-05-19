-- Phase 5A.6: Group Calendar Foundation.
--
-- Adds leader-editable per-group calendars so each Life Group can reflect
-- its actual schedule -- rotations (e.g. Community Night / Men's
-- Transformation / Study / Women's Transformation / Study), special
-- nights, OFF weeks, and cancellations -- without overbuilding a full
-- recurrence engine. When a group publishes a calendar event for a
-- given week, that event overrides the default meeting_day / meeting_time
-- (Phase 5A.5) for check-in due-date math. OFF / cancelled events
-- suppress check-in due for that week.
--
-- Architecture mirrors Phase 5A.2 / 5A.5 / 5C.0 verbatim:
--   * Writes flow through narrow SECURITY DEFINER RPCs. RLS is SELECT-only
--     outside the RPC surface; no broad INSERT / UPDATE / DELETE policies.
--   * Each function explicitly enforces auth (auth_is_admin() or
--     auth_is_leader_of(group_id) + auth_profile_id() not null), validates
--     inputs, and writes the data change AND the audit_events row in one
--     transaction.
--   * No hard deletes. Archive is orthogonal to status: archived_at is the
--     archive signal; the status enum stays scheduled / off / cancelled so
--     a cancelled event remains visible until archived.
--   * One active (non-archived) event per group per date in this MVP, via
--     a partial unique index. Multi-event days / weeks are deferred.
--
-- Fixed error tokens raised by these functions, mapped to friendly UI
-- text by lib/admin/action-result.ts and lib/leader/action-result.ts:
--   insufficient_privilege, invalid_input, missing_group, missing_event,
--   group_closed, event_already_archived, event_not_archived, date_conflict.

-- ---------------------------------------------------------------------------
-- 1. New enums.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'group_calendar_event_type') then
    create type public.group_calendar_event_type as enum (
      'study',
      'community_night',
      'mens_transformation',
      'womens_transformation',
      'social',
      'service',
      'prayer',
      'off',
      'cancelled',
      'other'
    );
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'group_calendar_event_status') then
    create type public.group_calendar_event_status as enum (
      'scheduled',
      'off',
      'cancelled'
    );
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 2. group_calendar_events table.
--
-- archived_at is the soft-delete / restore signal; it is independent of
-- status. A cancelled event stays visible to leaders and admins until
-- archived. The partial unique index on (group_id, event_date) WHERE
-- archived_at IS NULL enforces one active event per group per date while
-- still allowing the same date to be re-used after the prior event has
-- been archived (i.e. archive + recreate is a valid leader workflow).
-- ---------------------------------------------------------------------------

create table if not exists public.group_calendar_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id),
  event_date date not null,
  start_time time null,
  end_time time null,
  event_type public.group_calendar_event_type not null default 'study',
  status public.group_calendar_event_status not null default 'scheduled',
  title text null,
  description text null,
  created_by uuid null references public.profiles(id),
  updated_by uuid null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null,

  constraint group_calendar_events_time_order
    check (end_time is null or start_time is null or end_time > start_time),

  -- Status / event_type consistency. The RPC layer coerces values before
  -- insert, but the CHECK constraint is the source of truth so a direct
  -- backfill (e.g. data migration script) can't violate the invariant.
  constraint group_calendar_events_status_type_consistent
    check (
      (status = 'off' and event_type = 'off')
      or (status = 'cancelled' and event_type = 'cancelled')
      or (status = 'scheduled' and event_type not in ('off', 'cancelled'))
    ),

  constraint group_calendar_events_title_length
    check (title is null or char_length(title) <= 200),

  constraint group_calendar_events_description_length
    check (description is null or char_length(description) <= 1000)
);

-- ---------------------------------------------------------------------------
-- 3. Indexes.
-- ---------------------------------------------------------------------------

-- Lookup by group + date range (leader / admin calendar view, dashboard
-- override resolver). Covers the (group_id, event_date) IN-filter pattern.
create index if not exists group_calendar_events_group_date_idx
  on public.group_calendar_events (group_id, event_date);

-- Lookup by date range across all groups, active only -- used by the
-- admin check-ins helper and the admin dashboard when batching events
-- for a single ISO week.
create index if not exists group_calendar_events_active_date_idx
  on public.group_calendar_events (event_date)
  where archived_at is null;

-- Fast scan for upcoming scheduled events when listing a leader's
-- assigned groups on the leader dashboard upcoming-events strip.
create index if not exists group_calendar_events_active_scheduled_idx
  on public.group_calendar_events (group_id)
  where status = 'scheduled' and archived_at is null;

-- Partial unique: one active event per group per date. Re-using a date
-- after archiving is intentionally allowed.
create unique index if not exists group_calendar_events_active_one_per_day
  on public.group_calendar_events (group_id, event_date)
  where archived_at is null;

-- ---------------------------------------------------------------------------
-- 4. Updated_at trigger. Reuses set_updated_at() from Phase 2 schema.
-- ---------------------------------------------------------------------------

drop trigger if exists group_calendar_events_set_updated_at on public.group_calendar_events;
create trigger group_calendar_events_set_updated_at
  before update on public.group_calendar_events
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. RLS: enable + SELECT-only policies.
--
-- Admin / staff_viewer read using the existing auth_is_admin_or_staff()
-- helper so calendar visibility mirrors groups / members / sessions
-- visibility. staff_viewer remains the deprecated read-only role; this
-- migration does not grant any new active product surface to it.
--
-- Leader / co_leader read scoped via auth_is_leader_of(group_id) so a
-- leader of one group cannot read another group's calendar events.
--
-- No INSERT / UPDATE / DELETE policies; writes flow exclusively through
-- the SECURITY DEFINER RPCs below.
-- ---------------------------------------------------------------------------

alter table public.group_calendar_events enable row level security;

drop policy if exists group_calendar_events_admin_staff_read on public.group_calendar_events;
create policy group_calendar_events_admin_staff_read on public.group_calendar_events
  for select to authenticated using (public.auth_is_admin_or_staff());

drop policy if exists group_calendar_events_leader_read on public.group_calendar_events;
create policy group_calendar_events_leader_read on public.group_calendar_events
  for select to authenticated using (public.auth_is_leader_of(group_id));

-- Table-level SELECT grant for `authenticated`. RLS sits on top of
-- table-level privileges in Postgres; without this grant a fresh
-- Supabase deploy returns "permission denied for table
-- group_calendar_events" before any policy evaluates. Mirrors the
-- Phase 5A.2 hardening migration which grants SELECT on every other
-- operational table to authenticated. Anon receives no grant -- the
-- two SELECT policies above are scoped `to authenticated`, so anon
-- callers are denied at the policy layer.
grant select on public.group_calendar_events to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Admin write RPCs.
--
-- Each function enforces auth_is_admin() + non-null auth_profile_id(),
-- validates inputs, coerces status/event_type consistency, performs the
-- mutation, and writes the audit_events row in the same transaction.
-- Admins are allowed to correct events on closed groups (matches the
-- Phase 5A.2 admin_update_group behaviour); the group_closed check is
-- enforced only on the leader RPCs below.
-- ---------------------------------------------------------------------------

create or replace function public.admin_create_group_calendar_event(
  p_group_id uuid,
  p_event_date date,
  p_start_time time,
  p_end_time time,
  p_event_type public.group_calendar_event_type,
  p_status public.group_calendar_event_status,
  p_title text,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_status public.group_calendar_event_status;
  v_event_type public.group_calendar_event_type;
  v_title text;
  v_description text;
  v_exists boolean;
  v_new_id uuid;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_group_id is null or p_event_date is null then
    raise exception 'invalid_input';
  end if;
  if p_status is null or p_event_type is null then
    raise exception 'invalid_input';
  end if;
  if p_end_time is not null and p_start_time is not null and p_end_time <= p_start_time then
    raise exception 'invalid_input';
  end if;

  -- Status / event_type coercion (defense-in-depth; the CHECK constraint
  -- enforces the same rule but a friendlier RPC accepts whatever the form
  -- submitted and aligns the two).
  v_status := p_status;
  if v_status = 'off' then
    v_event_type := 'off';
  elsif v_status = 'cancelled' then
    v_event_type := 'cancelled';
  else
    -- scheduled: event_type must not be off / cancelled
    if p_event_type in ('off', 'cancelled') then
      raise exception 'invalid_input';
    end if;
    v_event_type := p_event_type;
  end if;

  v_title       := nullif(btrim(coalesce(p_title, '')), '');
  v_description := nullif(btrim(coalesce(p_description, '')), '');
  if v_title is not null and char_length(v_title) > 200 then
    raise exception 'invalid_input';
  end if;
  if v_description is not null and char_length(v_description) > 1000 then
    raise exception 'invalid_input';
  end if;

  select true into v_exists from public.groups where id = p_group_id limit 1;
  if v_exists is null then
    raise exception 'missing_group';
  end if;

  begin
    insert into public.group_calendar_events (
      group_id, event_date, start_time, end_time,
      event_type, status, title, description,
      created_by, updated_by
    )
    values (
      p_group_id, p_event_date, p_start_time, p_end_time,
      v_event_type, v_status, v_title, v_description,
      v_actor, v_actor
    )
    returning id into v_new_id;
  exception when unique_violation then
    raise exception 'date_conflict';
  end;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.group_calendar_event_created',
    'group_calendar_events',
    v_new_id,
    jsonb_build_object(
      'after', jsonb_build_object(
        'group_id', p_group_id,
        'event_date', p_event_date,
        'start_time', p_start_time,
        'end_time', p_end_time,
        'event_type', v_event_type,
        'status', v_status,
        'has_title', v_title is not null,
        'has_description', v_description is not null
      )
    )
  );

  return v_new_id;
end;
$$;

create or replace function public.admin_update_group_calendar_event(
  p_event_id uuid,
  p_event_date date,
  p_start_time time,
  p_end_time time,
  p_event_type public.group_calendar_event_type,
  p_status public.group_calendar_event_status,
  p_title text,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_existing record;
  v_status public.group_calendar_event_status;
  v_event_type public.group_calendar_event_type;
  v_title text;
  v_description text;
  v_before jsonb;
  v_after jsonb;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_event_id is null or p_event_date is null
     or p_status is null or p_event_type is null then
    raise exception 'invalid_input';
  end if;
  if p_end_time is not null and p_start_time is not null and p_end_time <= p_start_time then
    raise exception 'invalid_input';
  end if;

  v_status := p_status;
  if v_status = 'off' then
    v_event_type := 'off';
  elsif v_status = 'cancelled' then
    v_event_type := 'cancelled';
  else
    if p_event_type in ('off', 'cancelled') then
      raise exception 'invalid_input';
    end if;
    v_event_type := p_event_type;
  end if;

  v_title       := nullif(btrim(coalesce(p_title, '')), '');
  v_description := nullif(btrim(coalesce(p_description, '')), '');
  if v_title is not null and char_length(v_title) > 200 then
    raise exception 'invalid_input';
  end if;
  if v_description is not null and char_length(v_description) > 1000 then
    raise exception 'invalid_input';
  end if;

  select id, group_id, event_date, start_time, end_time,
         event_type, status, title, description, archived_at
    into v_existing
    from public.group_calendar_events
   where id = p_event_id
   for update;
  if v_existing.id is null then
    raise exception 'missing_event';
  end if;
  if v_existing.archived_at is not null then
    raise exception 'event_already_archived';
  end if;

  v_before := jsonb_build_object(
    'event_date', v_existing.event_date,
    'start_time', v_existing.start_time,
    'end_time', v_existing.end_time,
    'event_type', v_existing.event_type,
    'status', v_existing.status,
    'has_title', v_existing.title is not null,
    'has_description', v_existing.description is not null
  );

  begin
    update public.group_calendar_events
       set event_date  = p_event_date,
           start_time  = p_start_time,
           end_time    = p_end_time,
           event_type  = v_event_type,
           status      = v_status,
           title       = v_title,
           description = v_description,
           updated_by  = v_actor
     where id = p_event_id;
  exception when unique_violation then
    raise exception 'date_conflict';
  end;

  v_after := jsonb_build_object(
    'event_date', p_event_date,
    'start_time', p_start_time,
    'end_time', p_end_time,
    'event_type', v_event_type,
    'status', v_status,
    'has_title', v_title is not null,
    'has_description', v_description is not null
  );

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.group_calendar_event_updated',
    'group_calendar_events',
    p_event_id,
    jsonb_build_object(
      'group_id', v_existing.group_id,
      'before', v_before,
      'after', v_after
    )
  );

  return p_event_id;
end;
$$;

create or replace function public.admin_archive_group_calendar_event(
  p_event_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_existing record;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  select id, group_id, event_date, status, archived_at
    into v_existing
    from public.group_calendar_events
   where id = p_event_id
   for update;
  if v_existing.id is null then
    raise exception 'missing_event';
  end if;
  if v_existing.archived_at is not null then
    raise exception 'event_already_archived';
  end if;

  update public.group_calendar_events
     set archived_at = now(),
         updated_by  = v_actor
   where id = p_event_id;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.group_calendar_event_archived',
    'group_calendar_events',
    p_event_id,
    jsonb_build_object(
      'group_id', v_existing.group_id,
      'event_date', v_existing.event_date,
      'status', v_existing.status
    )
  );

  return p_event_id;
end;
$$;

create or replace function public.admin_restore_group_calendar_event(
  p_event_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_existing record;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  select id, group_id, event_date, status, archived_at
    into v_existing
    from public.group_calendar_events
   where id = p_event_id
   for update;
  if v_existing.id is null then
    raise exception 'missing_event';
  end if;
  if v_existing.archived_at is null then
    raise exception 'event_not_archived';
  end if;

  -- Partial unique enforces one active event per group/date; restoring
  -- onto a date that has another active event must raise date_conflict.
  begin
    update public.group_calendar_events
       set archived_at = null,
           updated_by  = v_actor
     where id = p_event_id;
  exception when unique_violation then
    raise exception 'date_conflict';
  end;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.group_calendar_event_restored',
    'group_calendar_events',
    p_event_id,
    jsonb_build_object(
      'group_id', v_existing.group_id,
      'event_date', v_existing.event_date,
      'status', v_existing.status
    )
  );

  return p_event_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Leader write RPCs.
--
-- Leader / co_leader can manage events only for groups they actively
-- lead or co-lead. All leader writes (create / update / archive /
-- restore) are blocked when the parent group is closed; the admin RPCs
-- above remain available to admins for corrections.
-- ---------------------------------------------------------------------------

create or replace function public.leader_create_group_calendar_event(
  p_group_id uuid,
  p_event_date date,
  p_start_time time,
  p_end_time time,
  p_event_type public.group_calendar_event_type,
  p_status public.group_calendar_event_status,
  p_title text,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_role public.user_role;
  v_lifecycle public.group_lifecycle_status;
  v_status public.group_calendar_event_status;
  v_event_type public.group_calendar_event_type;
  v_title text;
  v_description text;
  v_new_id uuid;
begin
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;
  v_role := public.auth_role();
  if v_role is null or v_role not in ('leader'::public.user_role, 'co_leader'::public.user_role) then
    raise exception 'insufficient_privilege';
  end if;
  if p_group_id is null or p_event_date is null
     or p_status is null or p_event_type is null then
    raise exception 'invalid_input';
  end if;
  if not public.auth_is_leader_of(p_group_id) then
    raise exception 'insufficient_privilege';
  end if;

  if p_end_time is not null and p_start_time is not null and p_end_time <= p_start_time then
    raise exception 'invalid_input';
  end if;

  v_status := p_status;
  if v_status = 'off' then
    v_event_type := 'off';
  elsif v_status = 'cancelled' then
    v_event_type := 'cancelled';
  else
    if p_event_type in ('off', 'cancelled') then
      raise exception 'invalid_input';
    end if;
    v_event_type := p_event_type;
  end if;

  v_title       := nullif(btrim(coalesce(p_title, '')), '');
  v_description := nullif(btrim(coalesce(p_description, '')), '');
  if v_title is not null and char_length(v_title) > 200 then
    raise exception 'invalid_input';
  end if;
  if v_description is not null and char_length(v_description) > 1000 then
    raise exception 'invalid_input';
  end if;

  select lifecycle_status into v_lifecycle
    from public.groups where id = p_group_id limit 1;
  if v_lifecycle is null then
    raise exception 'missing_group';
  end if;
  if v_lifecycle = 'closed'::public.group_lifecycle_status then
    raise exception 'group_closed';
  end if;

  begin
    insert into public.group_calendar_events (
      group_id, event_date, start_time, end_time,
      event_type, status, title, description,
      created_by, updated_by
    )
    values (
      p_group_id, p_event_date, p_start_time, p_end_time,
      v_event_type, v_status, v_title, v_description,
      v_actor, v_actor
    )
    returning id into v_new_id;
  exception when unique_violation then
    raise exception 'date_conflict';
  end;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'leader.group_calendar_event_created',
    'group_calendar_events',
    v_new_id,
    jsonb_build_object(
      'after', jsonb_build_object(
        'group_id', p_group_id,
        'event_date', p_event_date,
        'start_time', p_start_time,
        'end_time', p_end_time,
        'event_type', v_event_type,
        'status', v_status,
        'has_title', v_title is not null,
        'has_description', v_description is not null
      )
    )
  );

  return v_new_id;
end;
$$;

create or replace function public.leader_update_group_calendar_event(
  p_event_id uuid,
  p_event_date date,
  p_start_time time,
  p_end_time time,
  p_event_type public.group_calendar_event_type,
  p_status public.group_calendar_event_status,
  p_title text,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_role public.user_role;
  v_existing record;
  v_lifecycle public.group_lifecycle_status;
  v_status public.group_calendar_event_status;
  v_event_type public.group_calendar_event_type;
  v_title text;
  v_description text;
  v_before jsonb;
  v_after jsonb;
begin
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;
  v_role := public.auth_role();
  if v_role is null or v_role not in ('leader'::public.user_role, 'co_leader'::public.user_role) then
    raise exception 'insufficient_privilege';
  end if;
  if p_event_id is null or p_event_date is null
     or p_status is null or p_event_type is null then
    raise exception 'invalid_input';
  end if;
  if p_end_time is not null and p_start_time is not null and p_end_time <= p_start_time then
    raise exception 'invalid_input';
  end if;

  v_status := p_status;
  if v_status = 'off' then
    v_event_type := 'off';
  elsif v_status = 'cancelled' then
    v_event_type := 'cancelled';
  else
    if p_event_type in ('off', 'cancelled') then
      raise exception 'invalid_input';
    end if;
    v_event_type := p_event_type;
  end if;

  v_title       := nullif(btrim(coalesce(p_title, '')), '');
  v_description := nullif(btrim(coalesce(p_description, '')), '');
  if v_title is not null and char_length(v_title) > 200 then
    raise exception 'invalid_input';
  end if;
  if v_description is not null and char_length(v_description) > 1000 then
    raise exception 'invalid_input';
  end if;

  select id, group_id, event_date, start_time, end_time,
         event_type, status, title, description, archived_at
    into v_existing
    from public.group_calendar_events
   where id = p_event_id
   for update;
  if v_existing.id is null then
    raise exception 'missing_event';
  end if;
  -- Normalize cross-group reads to missing_event so a leader of group A
  -- cannot probe whether an event_id exists (or is archived) in group B
  -- via the difference between insufficient_privilege /
  -- event_already_archived errors.
  if not public.auth_is_leader_of(v_existing.group_id) then
    raise exception 'missing_event';
  end if;
  if v_existing.archived_at is not null then
    raise exception 'event_already_archived';
  end if;

  select lifecycle_status into v_lifecycle
    from public.groups where id = v_existing.group_id limit 1;
  if v_lifecycle is null then
    raise exception 'missing_group';
  end if;
  if v_lifecycle = 'closed'::public.group_lifecycle_status then
    raise exception 'group_closed';
  end if;

  v_before := jsonb_build_object(
    'event_date', v_existing.event_date,
    'start_time', v_existing.start_time,
    'end_time', v_existing.end_time,
    'event_type', v_existing.event_type,
    'status', v_existing.status,
    'has_title', v_existing.title is not null,
    'has_description', v_existing.description is not null
  );

  begin
    update public.group_calendar_events
       set event_date  = p_event_date,
           start_time  = p_start_time,
           end_time    = p_end_time,
           event_type  = v_event_type,
           status      = v_status,
           title       = v_title,
           description = v_description,
           updated_by  = v_actor
     where id = p_event_id;
  exception when unique_violation then
    raise exception 'date_conflict';
  end;

  v_after := jsonb_build_object(
    'event_date', p_event_date,
    'start_time', p_start_time,
    'end_time', p_end_time,
    'event_type', v_event_type,
    'status', v_status,
    'has_title', v_title is not null,
    'has_description', v_description is not null
  );

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'leader.group_calendar_event_updated',
    'group_calendar_events',
    p_event_id,
    jsonb_build_object(
      'group_id', v_existing.group_id,
      'before', v_before,
      'after', v_after
    )
  );

  return p_event_id;
end;
$$;

create or replace function public.leader_archive_group_calendar_event(
  p_event_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_role public.user_role;
  v_existing record;
  v_lifecycle public.group_lifecycle_status;
begin
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;
  v_role := public.auth_role();
  if v_role is null or v_role not in ('leader'::public.user_role, 'co_leader'::public.user_role) then
    raise exception 'insufficient_privilege';
  end if;
  if p_event_id is null then
    raise exception 'invalid_input';
  end if;

  select id, group_id, event_date, status, archived_at
    into v_existing
    from public.group_calendar_events
   where id = p_event_id
   for update;
  if v_existing.id is null then
    raise exception 'missing_event';
  end if;
  -- Normalize cross-group reads to missing_event (see comment on
  -- leader_update_group_calendar_event).
  if not public.auth_is_leader_of(v_existing.group_id) then
    raise exception 'missing_event';
  end if;
  if v_existing.archived_at is not null then
    raise exception 'event_already_archived';
  end if;

  select lifecycle_status into v_lifecycle
    from public.groups where id = v_existing.group_id limit 1;
  if v_lifecycle is null then
    raise exception 'missing_group';
  end if;
  if v_lifecycle = 'closed'::public.group_lifecycle_status then
    raise exception 'group_closed';
  end if;

  update public.group_calendar_events
     set archived_at = now(),
         updated_by  = v_actor
   where id = p_event_id;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'leader.group_calendar_event_archived',
    'group_calendar_events',
    p_event_id,
    jsonb_build_object(
      'group_id', v_existing.group_id,
      'event_date', v_existing.event_date,
      'status', v_existing.status
    )
  );

  return p_event_id;
end;
$$;

create or replace function public.leader_restore_group_calendar_event(
  p_event_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_role public.user_role;
  v_existing record;
  v_lifecycle public.group_lifecycle_status;
begin
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;
  v_role := public.auth_role();
  if v_role is null or v_role not in ('leader'::public.user_role, 'co_leader'::public.user_role) then
    raise exception 'insufficient_privilege';
  end if;
  if p_event_id is null then
    raise exception 'invalid_input';
  end if;

  select id, group_id, event_date, status, archived_at
    into v_existing
    from public.group_calendar_events
   where id = p_event_id
   for update;
  if v_existing.id is null then
    raise exception 'missing_event';
  end if;
  -- Normalize cross-group reads to missing_event (see comment on
  -- leader_update_group_calendar_event).
  if not public.auth_is_leader_of(v_existing.group_id) then
    raise exception 'missing_event';
  end if;
  if v_existing.archived_at is null then
    raise exception 'event_not_archived';
  end if;

  select lifecycle_status into v_lifecycle
    from public.groups where id = v_existing.group_id limit 1;
  if v_lifecycle is null then
    raise exception 'missing_group';
  end if;
  if v_lifecycle = 'closed'::public.group_lifecycle_status then
    raise exception 'group_closed';
  end if;

  begin
    update public.group_calendar_events
       set archived_at = null,
           updated_by  = v_actor
     where id = p_event_id;
  exception when unique_violation then
    raise exception 'date_conflict';
  end;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'leader.group_calendar_event_restored',
    'group_calendar_events',
    p_event_id,
    jsonb_build_object(
      'group_id', v_existing.group_id,
      'event_date', v_existing.event_date,
      'status', v_existing.status
    )
  );

  return p_event_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Grants. Mirrors Phase 5A.2 / 5C.0: revoke from public/anon/authenticated,
--    grant execute to authenticated only. The function body enforces the
--    role / leadership check; granting execute to authenticated only makes
--    the function *callable*.
-- ---------------------------------------------------------------------------

revoke all on function public.admin_create_group_calendar_event(
  uuid, date, time, time,
  public.group_calendar_event_type, public.group_calendar_event_status, text, text
) from public;
revoke all on function public.admin_create_group_calendar_event(
  uuid, date, time, time,
  public.group_calendar_event_type, public.group_calendar_event_status, text, text
) from anon;
revoke all on function public.admin_create_group_calendar_event(
  uuid, date, time, time,
  public.group_calendar_event_type, public.group_calendar_event_status, text, text
) from authenticated;
grant  execute on function public.admin_create_group_calendar_event(
  uuid, date, time, time,
  public.group_calendar_event_type, public.group_calendar_event_status, text, text
) to authenticated;

revoke all on function public.admin_update_group_calendar_event(
  uuid, date, time, time,
  public.group_calendar_event_type, public.group_calendar_event_status, text, text
) from public;
revoke all on function public.admin_update_group_calendar_event(
  uuid, date, time, time,
  public.group_calendar_event_type, public.group_calendar_event_status, text, text
) from anon;
revoke all on function public.admin_update_group_calendar_event(
  uuid, date, time, time,
  public.group_calendar_event_type, public.group_calendar_event_status, text, text
) from authenticated;
grant  execute on function public.admin_update_group_calendar_event(
  uuid, date, time, time,
  public.group_calendar_event_type, public.group_calendar_event_status, text, text
) to authenticated;

revoke all on function public.admin_archive_group_calendar_event(uuid) from public;
revoke all on function public.admin_archive_group_calendar_event(uuid) from anon;
revoke all on function public.admin_archive_group_calendar_event(uuid) from authenticated;
grant  execute on function public.admin_archive_group_calendar_event(uuid) to authenticated;

revoke all on function public.admin_restore_group_calendar_event(uuid) from public;
revoke all on function public.admin_restore_group_calendar_event(uuid) from anon;
revoke all on function public.admin_restore_group_calendar_event(uuid) from authenticated;
grant  execute on function public.admin_restore_group_calendar_event(uuid) to authenticated;

revoke all on function public.leader_create_group_calendar_event(
  uuid, date, time, time,
  public.group_calendar_event_type, public.group_calendar_event_status, text, text
) from public;
revoke all on function public.leader_create_group_calendar_event(
  uuid, date, time, time,
  public.group_calendar_event_type, public.group_calendar_event_status, text, text
) from anon;
revoke all on function public.leader_create_group_calendar_event(
  uuid, date, time, time,
  public.group_calendar_event_type, public.group_calendar_event_status, text, text
) from authenticated;
grant  execute on function public.leader_create_group_calendar_event(
  uuid, date, time, time,
  public.group_calendar_event_type, public.group_calendar_event_status, text, text
) to authenticated;

revoke all on function public.leader_update_group_calendar_event(
  uuid, date, time, time,
  public.group_calendar_event_type, public.group_calendar_event_status, text, text
) from public;
revoke all on function public.leader_update_group_calendar_event(
  uuid, date, time, time,
  public.group_calendar_event_type, public.group_calendar_event_status, text, text
) from anon;
revoke all on function public.leader_update_group_calendar_event(
  uuid, date, time, time,
  public.group_calendar_event_type, public.group_calendar_event_status, text, text
) from authenticated;
grant  execute on function public.leader_update_group_calendar_event(
  uuid, date, time, time,
  public.group_calendar_event_type, public.group_calendar_event_status, text, text
) to authenticated;

revoke all on function public.leader_archive_group_calendar_event(uuid) from public;
revoke all on function public.leader_archive_group_calendar_event(uuid) from anon;
revoke all on function public.leader_archive_group_calendar_event(uuid) from authenticated;
grant  execute on function public.leader_archive_group_calendar_event(uuid) to authenticated;

revoke all on function public.leader_restore_group_calendar_event(uuid) from public;
revoke all on function public.leader_restore_group_calendar_event(uuid) from anon;
revoke all on function public.leader_restore_group_calendar_event(uuid) from authenticated;
grant  execute on function public.leader_restore_group_calendar_event(uuid) to authenticated;

comment on function public.admin_create_group_calendar_event(
  uuid, date, time, time,
  public.group_calendar_event_type, public.group_calendar_event_status, text, text
) is 'Phase 5A.6 admin write: inserts a group_calendar_events row plus an audit_events row in the same transaction. Coerces event_type for off/cancelled status and maps unique_violation to date_conflict.';

comment on function public.admin_update_group_calendar_event(
  uuid, date, time, time,
  public.group_calendar_event_type, public.group_calendar_event_status, text, text
) is 'Phase 5A.6 admin write: updates a non-archived group_calendar_events row and writes an audit_events row. Raises event_already_archived if the event is archived.';

comment on function public.admin_archive_group_calendar_event(uuid) is
  'Phase 5A.6 admin write: soft-archives a group_calendar_events row (sets archived_at = now()). No hard delete.';

comment on function public.admin_restore_group_calendar_event(uuid) is
  'Phase 5A.6 admin write: clears archived_at on a previously archived group_calendar_events row.';

comment on function public.leader_create_group_calendar_event(
  uuid, date, time, time,
  public.group_calendar_event_type, public.group_calendar_event_status, text, text
) is 'Phase 5A.6 leader write: scoped to auth_is_leader_of(group_id); blocked on closed groups.';

comment on function public.leader_update_group_calendar_event(
  uuid, date, time, time,
  public.group_calendar_event_type, public.group_calendar_event_status, text, text
) is 'Phase 5A.6 leader write: scoped to auth_is_leader_of(event.group_id); blocked on closed groups and archived events.';

comment on function public.leader_archive_group_calendar_event(uuid) is
  'Phase 5A.6 leader write: soft-archives an event scoped to the leader''s group; blocked on closed groups.';

comment on function public.leader_restore_group_calendar_event(uuid) is
  'Phase 5A.6 leader write: clears archived_at scoped to the leader''s group; blocked on closed groups.';
