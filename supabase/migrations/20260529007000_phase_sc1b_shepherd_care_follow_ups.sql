-- Phase SC.1B: Shepherd Care follow-ups (the task-list half of the A1 care
-- model). Resolves issue #107.
--
-- SC.1A shipped the care PROFILE (status / last contact / next touchpoint)
-- and the append-only INTERACTION history — the "history log" half. This
-- slice adds the "task list" half Julian asked for ("Maybe both!"): a
-- per-Shepherd list of concrete next-steps he can create, give a due date,
-- and work through open -> in_progress -> done, living right alongside the
-- interaction history on the care profile. This completes the A1 data model
-- (profiles + interactions + follow_ups).
--
-- Privacy posture mirrors the rest of the care module, and is intentionally
-- STRICTER than the generic public.follow_ups table:
--   * RLS SELECT uses public.auth_is_admin() (super_admin + ministry_admin
--     only) — NOT auth_is_admin_or_staff(), and NEVER the over_shepherd
--     coverage path. staff_viewer / leader / co_leader / over_shepherd can
--     never see, reach, or be assigned a care follow-up.
--   * NO insert/update/delete policies. All writes go through the
--     SECURITY DEFINER RPCs below, which gate on auth_is_admin() inside the
--     function body and write a paired audit_events row in the same
--     transaction.
--   * No hard deletes. Corrections happen via the update RPCs.
--   * Follow-up title / notes bodies are NEVER written to audit metadata —
--     presence flags only (consistent with the SC.1A care RPCs).
--
-- This is a SEPARATE table from public.follow_ups; the two never cross-read.
-- The care UI may glance at a count of generic follow_ups for a shepherd
-- (a one-way cross-link), but the generic surface never touches care tables.
--
-- Over-shepherd WRITE of care follow-ups (#104) is intentionally out of
-- scope; this slice unblocks that decision but does not build that surface.
--
-- Fixed error tokens raised by these functions (mapped to friendly messages
-- by lib/admin/action-result.ts):
--   insufficient_privilege, invalid_input, missing_care_profile,
--   missing_follow_up, invalid_status_transition.

-- ---------------------------------------------------------------------------
-- Enum
-- ---------------------------------------------------------------------------
-- Three-state workflow, mirroring the open/in_progress/done core of the
-- generic follow-up workflow. (The generic table additionally has 'snoozed';
-- care follow-ups deliberately omit it to keep the pastoral task list simple.)

create type public.shepherd_care_follow_up_status as enum (
  'open',
  'in_progress',
  'done'
);

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table public.shepherd_care_follow_ups (
  id uuid primary key default gen_random_uuid(),
  care_profile_id uuid not null
    references public.shepherd_care_profiles(id) on delete cascade,
  title text not null,
  due_date date,
  status public.shepherd_care_follow_up_status not null default 'open',
  notes text,
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Set in the same transaction when status moves to 'done', cleared when
  -- status moves back out of 'done'. Maintained authoritatively by the
  -- update-status RPC (the TS pure helper mirrors the rule for the UI).
  completed_at timestamptz
);

comment on table public.shepherd_care_follow_ups is
  'Phase SC.1B admin-only care follow-up tasks. One row per concrete next-step Julian owes a Shepherd, attached to a shepherd_care_profiles row. Writes only via the SECURITY DEFINER admin RPCs. Separate from public.follow_ups; never reachable by leaders / over-shepherds.';

-- Per-profile list reads order by urgency (overdue first, then soonest due
-- date); this composite index supports the care_profile_id-scoped read.
create index idx_shepherd_care_follow_ups_care_profile
  on public.shepherd_care_follow_ups (care_profile_id, status, due_date);

-- The SC.3 dashboard reads outstanding (not-done) follow-ups across every
-- profile to surface overdue/open tasks. A partial index keeps that scan
-- cheap as the done pile grows.
create index idx_shepherd_care_follow_ups_outstanding
  on public.shepherd_care_follow_ups (due_date)
  where status <> 'done';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Admin-only SELECT. auth_is_admin() = super_admin + ministry_admin only.
-- No INSERT/UPDATE/DELETE policies — writes only via the SECURITY DEFINER
-- RPCs below. The table-level SELECT grant to `authenticated` is required
-- for the policy to be evaluated at all (Postgres evaluates RLS on top of
-- table privileges); matches the SC.1A foundation grant pattern. No write
-- grants of any kind.

alter table public.shepherd_care_follow_ups enable row level security;

create policy shepherd_care_follow_ups_admin_select
  on public.shepherd_care_follow_ups
  for select to authenticated using (public.auth_is_admin());

grant select on public.shepherd_care_follow_ups to authenticated;

-- ---------------------------------------------------------------------------
-- 1. admin_create_shepherd_care_follow_up
-- ---------------------------------------------------------------------------
-- Inserts a new follow-up against an existing care profile in 'open' state.
-- The title / notes bodies are NEVER stored in audit metadata — presence
-- flags only.
create or replace function public.admin_create_shepherd_care_follow_up(
  p_care_profile_id uuid,
  p_title text,
  p_due_date date,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_title text;
  v_notes text;
  v_shepherd_profile_id uuid;
  v_new_id uuid;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_care_profile_id is null then
    raise exception 'invalid_input';
  end if;

  v_title := nullif(btrim(coalesce(p_title, '')), '');
  if v_title is null then
    raise exception 'invalid_input';
  end if;
  if length(v_title) > 200 then
    raise exception 'invalid_input';
  end if;

  v_notes := nullif(btrim(coalesce(p_notes, '')), '');
  if v_notes is not null and length(v_notes) > 2000 then
    raise exception 'invalid_input';
  end if;

  -- The care profile must already exist. Capture the shepherd_profile_id
  -- for the audit trail (not the title/notes content).
  select shepherd_profile_id
    into v_shepherd_profile_id
    from public.shepherd_care_profiles
   where id = p_care_profile_id
   limit 1;
  if v_shepherd_profile_id is null then
    raise exception 'missing_care_profile';
  end if;

  insert into public.shepherd_care_follow_ups (
    care_profile_id, title, due_date, status, notes, created_by_profile_id
  ) values (
    p_care_profile_id,
    v_title,
    p_due_date,
    'open'::public.shepherd_care_follow_up_status,
    v_notes,
    v_actor
  )
  returning id into v_new_id;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.create_shepherd_care_follow_up',
    'shepherd_care_follow_ups',
    v_new_id,
    jsonb_build_object(
      'after', jsonb_build_object(
        'status', 'open',
        'due_date', p_due_date,
        'has_notes', v_notes is not null
      ),
      'care_profile_id', p_care_profile_id,
      'shepherd_profile_id', v_shepherd_profile_id
    )
  );

  return v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. admin_update_shepherd_care_follow_up_status
-- ---------------------------------------------------------------------------
-- Moves a follow-up between open / in_progress / done. Any state may move to
-- any OTHER state; a same-state "transition" is rejected as a no-op.
-- completed_at is stamped when moving to 'done' and cleared when moving out
-- of 'done', in the same transaction.
create or replace function public.admin_update_shepherd_care_follow_up_status(
  p_follow_up_id uuid,
  p_new_status public.shepherd_care_follow_up_status
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_existing record;
  v_new_completed_at timestamptz;
  v_persisted record;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_follow_up_id is null or p_new_status is null then
    raise exception 'invalid_input';
  end if;

  -- Lock the row so a concurrent status change can't race the audit before/
  -- after snapshot.
  select id, care_profile_id, status, completed_at
    into v_existing
    from public.shepherd_care_follow_ups
   where id = p_follow_up_id
   for update;
  if v_existing.id is null then
    raise exception 'missing_follow_up';
  end if;

  -- "may move to any other" — reject same-state no-ops so the workflow and
  -- audit trail only record real progress.
  if v_existing.status = p_new_status then
    raise exception 'invalid_status_transition';
  end if;

  -- completed_at is owned by the 'done' state: set on entry, cleared on exit.
  if p_new_status = 'done'::public.shepherd_care_follow_up_status then
    v_new_completed_at := now();
  else
    v_new_completed_at := null;
  end if;

  update public.shepherd_care_follow_ups
     set status = p_new_status,
         completed_at = v_new_completed_at,
         updated_at = now()
   where id = p_follow_up_id
  returning id, care_profile_id, status, completed_at into v_persisted;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.update_shepherd_care_follow_up_status',
    'shepherd_care_follow_ups',
    v_persisted.id,
    jsonb_build_object(
      'before', jsonb_build_object(
        'status', v_existing.status,
        'has_completed_at', v_existing.completed_at is not null
      ),
      'after', jsonb_build_object(
        'status', v_persisted.status,
        'has_completed_at', v_persisted.completed_at is not null
      ),
      'care_profile_id', v_persisted.care_profile_id
    )
  );

  return v_persisted.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. admin_update_shepherd_care_follow_up
-- ---------------------------------------------------------------------------
-- Edits a follow-up's details (title / due date / notes) WITHOUT changing
-- status — honors the no-hard-delete posture by letting Julian correct a row
-- in place. Tri-state _set_ flags let callers update one field without
-- clobbering others. title / notes bodies are NEVER stored in audit metadata.
create or replace function public.admin_update_shepherd_care_follow_up(
  p_follow_up_id uuid,
  p_title text,
  p_set_due_date boolean,
  p_due_date date,
  p_set_notes boolean,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_existing record;
  v_title text;
  v_notes text;
  v_persisted record;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_follow_up_id is null then
    raise exception 'invalid_input';
  end if;

  v_title := nullif(btrim(coalesce(p_title, '')), '');
  if v_title is null then
    raise exception 'invalid_input';
  end if;
  if length(v_title) > 200 then
    raise exception 'invalid_input';
  end if;

  if coalesce(p_set_notes, false) then
    v_notes := nullif(btrim(coalesce(p_notes, '')), '');
    if v_notes is not null and length(v_notes) > 2000 then
      raise exception 'invalid_input';
    end if;
  end if;

  select id, care_profile_id, notes, due_date
    into v_existing
    from public.shepherd_care_follow_ups
   where id = p_follow_up_id
   for update;
  if v_existing.id is null then
    raise exception 'missing_follow_up';
  end if;

  update public.shepherd_care_follow_ups
     set title = v_title,
         due_date = case when coalesce(p_set_due_date, false) then p_due_date
                         else public.shepherd_care_follow_ups.due_date end,
         notes = case when coalesce(p_set_notes, false) then v_notes
                      else public.shepherd_care_follow_ups.notes end,
         updated_at = now()
   where id = p_follow_up_id
  returning id, care_profile_id, due_date, notes into v_persisted;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.update_shepherd_care_follow_up',
    'shepherd_care_follow_ups',
    v_persisted.id,
    jsonb_build_object(
      'before', jsonb_build_object(
        'due_date', v_existing.due_date,
        'has_notes', v_existing.notes is not null
      ),
      'after', jsonb_build_object(
        'due_date', v_persisted.due_date,
        'has_notes', v_persisted.notes is not null
      ),
      'care_profile_id', v_persisted.care_profile_id,
      'due_date_set', coalesce(p_set_due_date, false),
      'notes_set', coalesce(p_set_notes, false)
    )
  );

  return v_persisted.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Revoke from public/anon/authenticated, then grant execute to
-- authenticated only. Each function body still enforces auth_is_admin(), so
-- granting execute to authenticated only makes the function callable while
-- the admin gate is the real boundary.
-- ---------------------------------------------------------------------------

revoke all on function public.admin_create_shepherd_care_follow_up(uuid, text, date, text) from public;
revoke all on function public.admin_create_shepherd_care_follow_up(uuid, text, date, text) from anon;
revoke all on function public.admin_create_shepherd_care_follow_up(uuid, text, date, text) from authenticated;
grant execute on function public.admin_create_shepherd_care_follow_up(uuid, text, date, text) to authenticated;

revoke all on function public.admin_update_shepherd_care_follow_up_status(
  uuid, public.shepherd_care_follow_up_status
) from public;
revoke all on function public.admin_update_shepherd_care_follow_up_status(
  uuid, public.shepherd_care_follow_up_status
) from anon;
revoke all on function public.admin_update_shepherd_care_follow_up_status(
  uuid, public.shepherd_care_follow_up_status
) from authenticated;
grant execute on function public.admin_update_shepherd_care_follow_up_status(
  uuid, public.shepherd_care_follow_up_status
) to authenticated;

revoke all on function public.admin_update_shepherd_care_follow_up(
  uuid, text, boolean, date, boolean, text
) from public;
revoke all on function public.admin_update_shepherd_care_follow_up(
  uuid, text, boolean, date, boolean, text
) from anon;
revoke all on function public.admin_update_shepherd_care_follow_up(
  uuid, text, boolean, date, boolean, text
) from authenticated;
grant execute on function public.admin_update_shepherd_care_follow_up(
  uuid, text, boolean, date, boolean, text
) to authenticated;

comment on function public.admin_create_shepherd_care_follow_up(uuid, text, date, text) is
  'Phase SC.1B admin write: inserts a shepherd_care_follow_ups row (status open) against an existing care profile, plus an audit_events row. title / notes bodies are NOT stored in audit metadata.';

comment on function public.admin_update_shepherd_care_follow_up_status(
  uuid, public.shepherd_care_follow_up_status
) is
  'Phase SC.1B admin write: transitions a care follow-up between open/in_progress/done (any state to any other), maintains completed_at, and writes an audit_events row.';

comment on function public.admin_update_shepherd_care_follow_up(
  uuid, text, boolean, date, boolean, text
) is
  'Phase SC.1B admin write: edits a care follow-up''s title / due date / notes without changing status, plus an audit_events row. title / notes bodies are NOT stored in audit metadata.';
