-- Phase: Member Care list foundation (the member half of the Care list,
-- gated behind the Super-Admin `care_member_list` flag; UI deferred).
--
-- Julian's care-list workflow is for LEADERS today (shepherd_care_*). This
-- slice codes the parallel backend for MEMBERS so the same workflow can be
-- turned on for the member roster later by flipping a Super-Admin flag — with
-- no schema change at flip time. It is a deliberate PARALLEL of the
-- shepherd_care foundation (20260518160000_phase5d0), not an extension of it:
-- shepherd_care_profiles is keyed to a leader PROFILE (a login user with a
-- role) and its RPCs gate on leader/co_leader; a member is a non-login
-- public.members row, so it needs its own tables + RPCs.
--
-- Two tables (the follow-up task list is deferred, exactly as SC.1A deferred
-- shepherd_care_follow_ups):
--   * member_care_profiles      — one row per member, summary state (status,
--                                 last contact, next touchpoint, admin_summary).
--   * member_care_interactions  — append-only log of care touches, each linked
--                                 to one member_care_profile.
--
-- Enums are REUSED, not redefined: the member care status / interaction type
-- are the same shepherd_care_status / shepherd_care_interaction_type enums the
-- leader care uses. There is NO second enum.
--
-- Privacy posture mirrors shepherd_care exactly:
--   * RLS SELECT uses public.auth_is_admin() (super_admin + ministry_admin
--     only) — NEVER auth_is_admin_or_staff(), and NEVER a leader /
--     over_shepherd / co_leader path. Member care is admin-only.
--   * NO insert/update/delete policies. All writes flow through the
--     SECURITY DEFINER RPCs below, which gate on auth_is_admin() in the body
--     and write a paired audit_events row in the same transaction.
--   * No hard deletes. member_care_profiles carries archived_at for future
--     soft-archive; interactions are append-only.
--   * admin_summary / notes bodies are NEVER written to audit metadata —
--     presence flags only.
--
-- The `care_member_list` feature flag (lib/admin/feature-flags.ts) gates the
-- UI surface only; it is NOT consulted here. The data layer is always present
-- and always admin-only — flipping the flag surfaces it, it does not create it.
--
-- Fixed error tokens raised by these functions (mapped to friendly messages by
-- lib/admin/action-result.ts):
--   insufficient_privilege, invalid_input, missing_member.

-- ---------------------------------------------------------------------------
-- Tables  (enums reused from the shepherd_care foundation — no new enum)
-- ---------------------------------------------------------------------------

create table public.member_care_profiles (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  current_status public.shepherd_care_status not null default 'healthy',
  last_contact_at date,
  next_touchpoint_due date,
  admin_summary text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_care_profiles_one_per_member unique (member_id)
);

comment on table public.member_care_profiles is
  'Admin-only care tracker for members (the care_member_list backend; UI flag-gated). One row per public.members row. Writes only via SECURITY DEFINER RPCs. Parallel to shepherd_care_profiles, which is for leader profiles.';
comment on column public.member_care_profiles.admin_summary is
  'Plain text admin-only summary (the member-care "Issue / current concern"). Never written to audit metadata — presence only.';

create table public.member_care_interactions (
  id uuid primary key default gen_random_uuid(),
  care_profile_id uuid not null references public.member_care_profiles(id) on delete restrict,
  interaction_at date not null,
  interaction_type public.shepherd_care_interaction_type not null,
  notes text,
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

comment on table public.member_care_interactions is
  'Append-only log of member-care interactions. No updates, no deletes. Writes only via admin_log_member_care_interaction.';

create index idx_member_care_profiles_current_status
  on public.member_care_profiles (current_status);
create index idx_member_care_profiles_next_touchpoint_due
  on public.member_care_profiles (next_touchpoint_due);
create index idx_member_care_interactions_care_profile_at
  on public.member_care_interactions (care_profile_id, interaction_at desc, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS  — admin-only SELECT, no write policies (writes via RPCs only)
-- ---------------------------------------------------------------------------
-- auth_is_admin() = super_admin + ministry_admin only. Deliberately NOT
-- auth_is_admin_or_staff(), and no leader / over_shepherd / co_leader path:
-- member care is admin-only, exactly like leader care.

alter table public.member_care_profiles enable row level security;
alter table public.member_care_interactions enable row level security;

create policy member_care_profiles_admin_select
  on public.member_care_profiles
  for select to authenticated using (public.auth_is_admin());

create policy member_care_interactions_admin_select
  on public.member_care_interactions
  for select to authenticated using (public.auth_is_admin());

-- Table-level SELECT grants for `authenticated`; RLS sits on top of table
-- privileges in Postgres, so without these the policies above never evaluate.
-- No INSERT / UPDATE / DELETE grants — writes only via the RPCs below.
grant select on public.member_care_profiles     to authenticated;
grant select on public.member_care_interactions to authenticated;

-- ---------------------------------------------------------------------------
-- 1. admin_upsert_member_care_profile
-- ---------------------------------------------------------------------------
-- Creates or updates a member_care_profiles row WITHOUT logging an
-- interaction. Tri-state _set_ flags let callers update one field without
-- clobbering others. admin_summary is NEVER stored in audit metadata.
create or replace function public.admin_upsert_member_care_profile(
  p_member_id uuid,
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

  if p_member_id is null then
    raise exception 'invalid_input';
  end if;

  -- At least one field must be set (mirrors the leader-care upsert guard; the
  -- coalesce defends against all-NULL flags slipping past `IF NOT (NULL)`).
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

  -- The care target is a member: it must exist and be active. Members have no
  -- role (they are non-login), so there is no role check — just existence +
  -- active status, the member-equivalent of the leader-care gate.
  select id, status
    into v_target
    from public.members
   where id = p_member_id
   limit 1;
  if v_target.id is null then
    raise exception 'missing_member';
  end if;
  if v_target.status <> 'active'::public.membership_status then
    raise exception 'missing_member';
  end if;

  -- Race-safe upsert: INSERT-DO-NOTHING → SELECT FOR UPDATE → UPDATE, so the
  -- audit before/after match the persisted row under a row lock even when two
  -- admins race the first upsert (same strategy as the leader-care RPC).
  insert into public.member_care_profiles (member_id, current_status)
  values (p_member_id, 'healthy'::public.shepherd_care_status)
  on conflict (member_id) do nothing
  returning id into v_inserted_id;

  v_was_just_created := v_inserted_id is not null;

  select id, current_status, next_touchpoint_due, admin_summary
    into v_existing
    from public.member_care_profiles
   where member_id = p_member_id
   for update;

  update public.member_care_profiles
     set current_status = case
                            when p_set_current_status
                              then coalesce(p_current_status, public.member_care_profiles.current_status)
                            else public.member_care_profiles.current_status
                          end,
         next_touchpoint_due = case
                                 when p_set_next_touchpoint_due then p_next_touchpoint_due
                                 else public.member_care_profiles.next_touchpoint_due
                               end,
         admin_summary = case
                           when p_set_admin_summary then v_summary
                           else public.member_care_profiles.admin_summary
                         end,
         updated_at = now()
   where member_id = p_member_id
  returning id, current_status, next_touchpoint_due, admin_summary
       into v_new_id, v_persisted_status, v_persisted_next_touchpoint, v_persisted_summary;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.upsert_member_care_profile',
    'member_care_profiles',
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
      'member_id', p_member_id,
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
-- 2. admin_log_member_care_interaction
-- ---------------------------------------------------------------------------
-- Append-only interaction logger. Takes the member_id (NOT a care_profile_id)
-- so the member_care_profiles row is lazily created on the first interaction
-- in the same transaction. last_contact_at advances via greatest() so an
-- out-of-order backfill never regresses it. notes is NEVER in audit metadata.
create or replace function public.admin_log_member_care_interaction(
  p_member_id uuid,
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

  if p_member_id is null
     or p_interaction_at is null
     or p_interaction_type is null then
    raise exception 'invalid_input';
  end if;
  -- Reject future-dated interactions (UTC-anchored, +1 day buffer for callers
  -- in time zones ahead of UTC) so the last_contact / needs-attention rollups
  -- can't be poisoned — same cap as the leader-care logger.
  if p_interaction_at > ((now() at time zone 'UTC')::date + 1) then
    raise exception 'invalid_input';
  end if;

  v_notes := nullif(btrim(coalesce(p_notes, '')), '');
  if v_notes is not null and length(v_notes) > 2000 then
    raise exception 'invalid_input';
  end if;

  -- Same target gate as the upsert RPC: an existing, active member.
  select id, status
    into v_target
    from public.members
   where id = p_member_id
   limit 1;
  if v_target.id is null then
    raise exception 'missing_member';
  end if;
  if v_target.status <> 'active'::public.membership_status then
    raise exception 'missing_member';
  end if;

  -- Lazy create / update the care_profile row in the same transaction;
  -- greatest(coalesce(...)) keeps last_contact_at monotonically forward.
  insert into public.member_care_profiles (
    member_id, current_status, last_contact_at, next_touchpoint_due
  ) values (
    p_member_id,
    case when p_set_current_status then coalesce(p_current_status, 'healthy'::public.shepherd_care_status)
         else 'healthy'::public.shepherd_care_status end,
    p_interaction_at,
    case when p_set_next_touchpoint_due then p_next_touchpoint_due else null end
  )
  on conflict (member_id) do update
    set last_contact_at = greatest(
          coalesce(public.member_care_profiles.last_contact_at, '1900-01-01'::date),
          p_interaction_at
        ),
        next_touchpoint_due = case
          when p_set_next_touchpoint_due then p_next_touchpoint_due
          else public.member_care_profiles.next_touchpoint_due
        end,
        current_status = case
          when p_set_current_status
            then coalesce(p_current_status, public.member_care_profiles.current_status)
          else public.member_care_profiles.current_status
        end,
        updated_at = now()
  returning id, current_status, last_contact_at, next_touchpoint_due
       into v_care_profile_id, v_persisted_status, v_persisted_last_contact, v_persisted_next_touchpoint;

  insert into public.member_care_interactions (
    care_profile_id, interaction_at, interaction_type, notes, created_by_profile_id
  ) values (
    v_care_profile_id, p_interaction_at, p_interaction_type, v_notes, v_actor
  )
  returning id into v_interaction_id;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.log_member_care_interaction',
    'member_care_interactions',
    v_interaction_id,
    jsonb_build_object(
      'after', jsonb_build_object(
        'interaction_type', p_interaction_type,
        'interaction_at', p_interaction_at,
        'has_notes', v_notes is not null,
        'care_profile_id', v_care_profile_id,
        'member_id', p_member_id,
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
-- authenticated only. Each body still enforces auth_is_admin(), so the admin
-- gate stays the real boundary.
-- ---------------------------------------------------------------------------

revoke all on function public.admin_upsert_member_care_profile(
  uuid, public.shepherd_care_status, boolean, date, boolean, text, boolean
) from public;
revoke all on function public.admin_upsert_member_care_profile(
  uuid, public.shepherd_care_status, boolean, date, boolean, text, boolean
) from anon;
revoke all on function public.admin_upsert_member_care_profile(
  uuid, public.shepherd_care_status, boolean, date, boolean, text, boolean
) from authenticated;
grant execute on function public.admin_upsert_member_care_profile(
  uuid, public.shepherd_care_status, boolean, date, boolean, text, boolean
) to authenticated;

revoke all on function public.admin_log_member_care_interaction(
  uuid, date, public.shepherd_care_interaction_type, text,
  boolean, date, boolean, public.shepherd_care_status
) from public;
revoke all on function public.admin_log_member_care_interaction(
  uuid, date, public.shepherd_care_interaction_type, text,
  boolean, date, boolean, public.shepherd_care_status
) from anon;
revoke all on function public.admin_log_member_care_interaction(
  uuid, date, public.shepherd_care_interaction_type, text,
  boolean, date, boolean, public.shepherd_care_status
) from authenticated;
grant execute on function public.admin_log_member_care_interaction(
  uuid, date, public.shepherd_care_interaction_type, text,
  boolean, date, boolean, public.shepherd_care_status
) to authenticated;

comment on function public.admin_upsert_member_care_profile(
  uuid, public.shepherd_care_status, boolean, date, boolean, text, boolean
) is
  'Admin write: upserts a member_care_profiles row (status / next_touchpoint_due / admin_summary) without logging an interaction, plus an audit_events row. admin_summary body is NOT stored in audit metadata.';

comment on function public.admin_log_member_care_interaction(
  uuid, date, public.shepherd_care_interaction_type, text,
  boolean, date, boolean, public.shepherd_care_status
) is
  'Admin write: appends a member_care_interactions row, lazy-creates / updates the member_care_profiles row (last_contact_at via greatest()), and writes an audit_events row. Note body is NOT stored in audit metadata.';
