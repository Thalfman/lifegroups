-- Phase 5D.0: Shepherd Care Tracker foundation (SC.1A).
--
-- Admin-only care tracker scoped to Julian's workflow. Replaces the
-- informal spreadsheet he keeps on leaders/co-leaders with a durable
-- table the rest of the admin tooling can build on.
--
-- Two tables only in this slice:
--   * shepherd_care_profiles      — one row per leader/co_leader, holds
--                                   summary state (status, last contact,
--                                   next touchpoint, admin_summary).
--   * shepherd_care_interactions  — append-only log of care touches,
--                                   each linked to one care_profile.
--
-- shepherd_care_follow_ups is INTENTIONALLY deferred. Follow-up workflow
-- will be revisited after Julian uses the basic logger for a while.
--
-- Privacy posture is intentionally stricter than the rest of the schema:
--   * RLS SELECT uses public.auth_is_admin(), NOT
--     public.auth_is_admin_or_staff(). staff_viewer is a legacy/no-access
--     role and must NOT see pastoral care notes.
--   * NO insert/update/delete policies on either table. All writes go
--     through SECURITY DEFINER RPCs that gate on auth_is_admin() inside
--     the function body and write the matching audit_events row in the
--     same transaction.
--   * No hard deletes. shepherd_care_profiles carries archived_at for
--     future soft-archive use; interactions are append-only.
--   * Care notes / admin_summary text are NEVER written to audit_events
--     metadata. We record presence flags only.
--
-- Encrypted private notes are documented as deferred. If Julian asks for
-- complete privacy on specific notes later, that's a follow-up slice.
--
-- Fixed error tokens raised by these functions (mapped to friendly
-- messages by lib/admin/action-result.ts):
--   insufficient_privilege, invalid_input, missing_profile.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.shepherd_care_status as enum (
  'healthy',
  'watch',
  'needs_attention'
);

create type public.shepherd_care_interaction_type as enum (
  'call',
  'text',
  'in_person',
  'meeting',
  'other'
);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.shepherd_care_profiles (
  id uuid primary key default gen_random_uuid(),
  shepherd_profile_id uuid not null references public.profiles(id) on delete restrict,
  current_status public.shepherd_care_status not null default 'healthy',
  last_contact_at date,
  next_touchpoint_due date,
  admin_summary text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shepherd_care_profiles_one_per_shepherd unique (shepherd_profile_id)
);

comment on table public.shepherd_care_profiles is
  'Phase 5D.0 admin-only care tracker. One row per leader/co_leader profile. Writes only via SECURITY DEFINER RPCs.';
comment on column public.shepherd_care_profiles.admin_summary is
  'Plain text admin-only summary. Encrypted private notes are intentionally deferred — see docs/SC_1A_SHEPHERD_CARE_FOUNDATION.md.';

create table public.shepherd_care_interactions (
  id uuid primary key default gen_random_uuid(),
  care_profile_id uuid not null references public.shepherd_care_profiles(id) on delete restrict,
  interaction_at date not null,
  interaction_type public.shepherd_care_interaction_type not null,
  notes text,
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

comment on table public.shepherd_care_interactions is
  'Phase 5D.0 append-only log of pastoral care interactions. No updates, no deletes. Writes only via admin_log_shepherd_care_interaction.';

create index idx_shepherd_care_profiles_current_status
  on public.shepherd_care_profiles (current_status);
create index idx_shepherd_care_profiles_next_touchpoint_due
  on public.shepherd_care_profiles (next_touchpoint_due);
create index idx_shepherd_care_interactions_care_profile_at
  on public.shepherd_care_interactions (care_profile_id, interaction_at desc, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Admin-only SELECT. Deliberately uses auth_is_admin() rather than
-- auth_is_admin_or_staff(): staff_viewer must NOT read pastoral care data.
-- No INSERT/UPDATE/DELETE policies — writes only via SECURITY DEFINER RPCs
-- declared below.

alter table public.shepherd_care_profiles enable row level security;
alter table public.shepherd_care_interactions enable row level security;

create policy shepherd_care_profiles_admin_select
  on public.shepherd_care_profiles
  for select to authenticated using (public.auth_is_admin());

create policy shepherd_care_interactions_admin_select
  on public.shepherd_care_interactions
  for select to authenticated using (public.auth_is_admin());

-- Table-level SELECT grants for `authenticated`. RLS sits on top of
-- table-level privileges in Postgres — without these grants, the
-- policies above are never evaluated and admin reads fail with
-- "permission denied" on a fresh deployment. Matches the pattern
-- documented in 20260518070000_phase5a2_grants_hardening.sql. No
-- INSERT / UPDATE / DELETE grants — writes only via the SECURITY
-- DEFINER RPCs declared below.
grant select on public.shepherd_care_profiles     to authenticated;
grant select on public.shepherd_care_interactions to authenticated;

-- ---------------------------------------------------------------------------
-- 1. admin_upsert_shepherd_care_profile
-- ---------------------------------------------------------------------------
-- Creates or updates a shepherd_care_profiles row WITHOUT logging an
-- interaction. Used for status / next-touchpoint / summary edits when
-- the admin isn't recording a touch. Tri-state _set_ flags let callers
-- update one field without clobbering others.
--
-- The admin_summary text is NEVER stored in audit metadata — only a
-- presence flag.
create or replace function public.admin_upsert_shepherd_care_profile(
  p_shepherd_profile_id uuid,
  p_current_status public.shepherd_care_status,
  p_set_current_status boolean,
  p_next_touchpoint_due date,
  p_set_next_touchpoint_due boolean,
  p_admin_summary text,
  p_set_admin_summary boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_target record;
  v_existing record;
  v_summary text;
  v_new_id uuid;
  v_inserted_id uuid;
  v_was_just_created boolean;
  v_persisted_status public.shepherd_care_status;
  v_persisted_next_touchpoint date;
  v_persisted_summary text;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_shepherd_profile_id is null then
    raise exception 'invalid_input';
  end if;

  -- Defense-in-depth: callers that bypass the validation layer (e.g. a
  -- direct RPC call from a future internal tool) must still update at
  -- least one field. Without this guard, every call would create an
  -- empty row + audit event with zero intended change.
  --
  -- The flags are explicitly coalesced because `null OR null OR null`
  -- evaluates to NULL in Postgres, and `IF NOT (NULL)` does NOT
  -- execute — so a caller passing NULL for all three flags would
  -- otherwise slip past this guard.
  if not (
    coalesce(p_set_current_status, false)
    or coalesce(p_set_next_touchpoint_due, false)
    or coalesce(p_set_admin_summary, false)
  ) then
    raise exception 'invalid_input';
  end if;

  if p_set_admin_summary then
    v_summary := nullif(btrim(coalesce(p_admin_summary, '')), '');
    if v_summary is not null and length(v_summary) > 2000 then
      raise exception 'invalid_input';
    end if;
  end if;

  -- Only leader / co_leader profiles are valid care targets. Reject
  -- admins, staff_viewer, and inactive profiles so the directory's
  -- privacy boundary holds even if a stale id reaches this RPC.
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

  -- Race-safety + audit accuracy strategy:
  --
  -- The naive ON CONFLICT DO UPDATE pattern has two issues when two
  -- admins concurrently perform the first upsert for the same shepherd:
  --   1. Each transaction's pre-insert SELECT FOR UPDATE returns no
  --      row (none exists yet), so neither holds a row lock that would
  --      serialize the writers.
  --   2. The audit `before` snapshot is null for the second writer
  --      even though a real row (from the first writer) was just
  --      updated by the merge — making the audit diff inaccurate in
  --      the exact race this RPC is supposed to handle.
  --
  -- Restructure as INSERT-DO-NOTHING → SELECT FOR UPDATE → UPDATE:
  --   * The DO NOTHING insert atomically guarantees the row exists.
  --   * The subsequent SELECT FOR UPDATE takes an exclusive row lock,
  --     so a second concurrent caller blocks here until the first
  --     transaction commits.
  --   * The UPDATE then runs against a row whose pre-state has been
  --     captured into v_existing under the lock, so both the audit
  --     `before` and `after` payloads match the persisted row state.
  --   * `case when p_set_X then ... else <table>.X end` in the UPDATE
  --     keeps each transaction's write surface limited to its intended
  --     changes (defense-in-depth, redundant with the lock).

  insert into public.shepherd_care_profiles (shepherd_profile_id, current_status)
  values (p_shepherd_profile_id, 'healthy'::public.shepherd_care_status)
  on conflict (shepherd_profile_id) do nothing
  returning id into v_inserted_id;

  -- RETURNING on ON CONFLICT DO NOTHING returns the inserted row only
  -- when a row was actually inserted; a no-op (existing row) sets the
  -- variable to NULL. We surface this in the audit metadata so a
  -- reviewer can distinguish "first write created the row with
  -- defaults, then we updated it" from a subsequent edit.
  v_was_just_created := v_inserted_id is not null;

  select id, current_status, next_touchpoint_due, admin_summary
    into v_existing
    from public.shepherd_care_profiles
   where shepherd_profile_id = p_shepherd_profile_id
   for update;

  update public.shepherd_care_profiles
     set current_status = case
                            when p_set_current_status
                              then coalesce(p_current_status, public.shepherd_care_profiles.current_status)
                            else public.shepherd_care_profiles.current_status
                          end,
         next_touchpoint_due = case
                                 when p_set_next_touchpoint_due then p_next_touchpoint_due
                                 else public.shepherd_care_profiles.next_touchpoint_due
                               end,
         admin_summary = case
                           when p_set_admin_summary then v_summary
                           else public.shepherd_care_profiles.admin_summary
                         end,
         updated_at = now()
   where shepherd_profile_id = p_shepherd_profile_id
  returning id, current_status, next_touchpoint_due, admin_summary
       into v_new_id, v_persisted_status, v_persisted_next_touchpoint, v_persisted_summary;

  -- Note bodies are intentionally NOT stored in audit metadata. We
  -- only record presence so the audit log remains shareable without
  -- leaking pastoral context. Both `before` (from the SELECT FOR
  -- UPDATE snapshot) and `after` (from the UPDATE's RETURNING) reflect
  -- the actual persisted row state under the row lock, so the audit
  -- trail stays accurate even when a concurrent transaction has just
  -- written. `was_just_created` distinguishes first-creates from
  -- subsequent edits (the empty defaults in `before` for a first
  -- create are technically the row state pre-UPDATE, not a lost
  -- prior value).
  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.upsert_shepherd_care_profile',
    'shepherd_care_profiles',
    v_new_id,
    jsonb_build_object(
      'before', jsonb_build_object(
        'current_status', v_existing.current_status,
        'next_touchpoint_due', v_existing.next_touchpoint_due,
        'has_summary', v_existing.admin_summary is not null
      ),
      'after', jsonb_build_object(
        'current_status', v_persisted_status,
        'next_touchpoint_due', v_persisted_next_touchpoint,
        'has_summary', v_persisted_summary is not null
      ),
      'shepherd_profile_id', p_shepherd_profile_id,
      'status_set', p_set_current_status,
      'next_touchpoint_set', p_set_next_touchpoint_due,
      'summary_set', p_set_admin_summary,
      'was_just_created', v_was_just_created
    )
  );

  return v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. admin_log_shepherd_care_interaction
-- ---------------------------------------------------------------------------
-- Append-only interaction logger. Takes the shepherd_profile_id (NOT a
-- care_profile_id) so the care_profile row can be lazily created on the
-- first interaction in the same transaction. last_contact_at is updated
-- via greatest() so an out-of-order backfill of an older date never
-- regresses the current last_contact value.
--
-- The notes text is NEVER stored in audit metadata — only a presence flag.
create or replace function public.admin_log_shepherd_care_interaction(
  p_shepherd_profile_id uuid,
  p_interaction_at date,
  p_interaction_type public.shepherd_care_interaction_type,
  p_notes text,
  p_set_next_touchpoint_due boolean,
  p_next_touchpoint_due date,
  p_set_current_status boolean,
  p_current_status public.shepherd_care_status
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_target record;
  v_notes text;
  v_care_profile_id uuid;
  v_interaction_id uuid;
  v_persisted_status public.shepherd_care_status;
  v_persisted_last_contact date;
  v_persisted_next_touchpoint date;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_shepherd_profile_id is null
     or p_interaction_at is null
     or p_interaction_type is null then
    raise exception 'invalid_input';
  end if;
  -- Future-dated interactions are rejected; they're a foot-gun for the
  -- last_contact_at / needs-attention rollups. The cap is anchored to
  -- UTC explicitly (rather than `current_date`, which is evaluated in
  -- the session time zone and would drift if the DB is ever deployed
  -- on a non-UTC clock) so it always agrees with the TS validator's
  -- `todayIsoUtc() + 1` cap. The +1 day buffer accommodates callers in
  -- time zones ahead of UTC, where local "today" can already be
  -- tomorrow on the server clock.
  if p_interaction_at > ((now() at time zone 'UTC')::date + 1) then
    raise exception 'invalid_input';
  end if;

  v_notes := nullif(btrim(coalesce(p_notes, '')), '');
  if v_notes is not null and length(v_notes) > 2000 then
    raise exception 'invalid_input';
  end if;

  -- Same target gating as the upsert RPC: leader/co_leader + active.
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

  -- Lazy create / update the care_profile row in the same transaction.
  -- greatest(coalesce(...)) keeps last_contact_at monotonically forward.
  insert into public.shepherd_care_profiles (
    shepherd_profile_id, current_status, last_contact_at, next_touchpoint_due
  ) values (
    p_shepherd_profile_id,
    case when p_set_current_status then coalesce(p_current_status, 'healthy'::public.shepherd_care_status)
         else 'healthy'::public.shepherd_care_status end,
    p_interaction_at,
    case when p_set_next_touchpoint_due then p_next_touchpoint_due else null end
  )
  on conflict (shepherd_profile_id) do update
    set last_contact_at = greatest(
          coalesce(public.shepherd_care_profiles.last_contact_at, '1900-01-01'::date),
          p_interaction_at
        ),
        next_touchpoint_due = case
          when p_set_next_touchpoint_due then p_next_touchpoint_due
          else public.shepherd_care_profiles.next_touchpoint_due
        end,
        current_status = case
          when p_set_current_status
            then coalesce(p_current_status, public.shepherd_care_profiles.current_status)
          else public.shepherd_care_profiles.current_status
        end,
        updated_at = now()
  returning id, current_status, last_contact_at, next_touchpoint_due
       into v_care_profile_id, v_persisted_status, v_persisted_last_contact, v_persisted_next_touchpoint;

  insert into public.shepherd_care_interactions (
    care_profile_id, interaction_at, interaction_type, notes, created_by_profile_id
  ) values (
    v_care_profile_id, p_interaction_at, p_interaction_type, v_notes, v_actor
  )
  returning id into v_interaction_id;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.log_shepherd_care_interaction',
    'shepherd_care_interactions',
    v_interaction_id,
    jsonb_build_object(
      'after', jsonb_build_object(
        'interaction_type', p_interaction_type,
        'interaction_at', p_interaction_at,
        'has_notes', v_notes is not null,
        'care_profile_id', v_care_profile_id,
        'shepherd_profile_id', p_shepherd_profile_id,
        'next_touchpoint_set', p_set_next_touchpoint_due,
        'status_set', p_set_current_status,
        'current_status', v_persisted_status,
        'last_contact_at', v_persisted_last_contact,
        'next_touchpoint_due', v_persisted_next_touchpoint
      )
    )
  );

  return v_interaction_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Revoke from public/anon/authenticated, then grant execute to
-- authenticated only. The function body still enforces auth_is_admin(),
-- so granting execute to authenticated only makes the function callable.
-- ---------------------------------------------------------------------------

revoke all on function public.admin_upsert_shepherd_care_profile(
  uuid, public.shepherd_care_status, boolean, date, boolean, text, boolean
) from public;
revoke all on function public.admin_upsert_shepherd_care_profile(
  uuid, public.shepherd_care_status, boolean, date, boolean, text, boolean
) from anon;
revoke all on function public.admin_upsert_shepherd_care_profile(
  uuid, public.shepherd_care_status, boolean, date, boolean, text, boolean
) from authenticated;
grant execute on function public.admin_upsert_shepherd_care_profile(
  uuid, public.shepherd_care_status, boolean, date, boolean, text, boolean
) to authenticated;

revoke all on function public.admin_log_shepherd_care_interaction(
  uuid, date, public.shepherd_care_interaction_type, text,
  boolean, date, boolean, public.shepherd_care_status
) from public;
revoke all on function public.admin_log_shepherd_care_interaction(
  uuid, date, public.shepherd_care_interaction_type, text,
  boolean, date, boolean, public.shepherd_care_status
) from anon;
revoke all on function public.admin_log_shepherd_care_interaction(
  uuid, date, public.shepherd_care_interaction_type, text,
  boolean, date, boolean, public.shepherd_care_status
) from authenticated;
grant execute on function public.admin_log_shepherd_care_interaction(
  uuid, date, public.shepherd_care_interaction_type, text,
  boolean, date, boolean, public.shepherd_care_status
) to authenticated;

comment on function public.admin_upsert_shepherd_care_profile(
  uuid, public.shepherd_care_status, boolean, date, boolean, text, boolean
) is
  'Phase 5D.0 admin write: upserts a shepherd_care_profiles row (status / next_touchpoint_due / admin_summary) without logging an interaction, plus an audit_events row. admin_summary body is NOT stored in audit metadata.';

comment on function public.admin_log_shepherd_care_interaction(
  uuid, date, public.shepherd_care_interaction_type, text,
  boolean, date, boolean, public.shepherd_care_status
) is
  'Phase 5D.0 admin write: appends a shepherd_care_interactions row, lazy-creates / updates the shepherd_care_profiles row (last_contact_at via greatest()), and writes an audit_events row. Note body is NOT stored in audit metadata.';
