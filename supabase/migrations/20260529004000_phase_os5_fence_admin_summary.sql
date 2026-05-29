-- Phase OS.5: fence the admin-only care summary below the row policy.
--
-- Codex review #2 on PR #106: the Over-Shepherd coverage-scoped SELECT policy
-- (phase_os3) grants SELECT on the WHOLE shepherd_care_profiles row, and the
-- foundation migration already grants `select on shepherd_care_profiles to
-- authenticated`. RLS is row-level only — it cannot withhold a single column —
-- so a covered Over-Shepherd could read shepherd_care_profiles.admin_summary
-- directly via PostgREST, even though the ADR says Over-Shepherds can never
-- read private/admin notes. The app-layer column allowlist (+ typed Omit<>) is
-- NOT a database fence.
--
-- Column-level GRANTs cannot separate over_shepherd from ministry_admin here:
-- both connect as the single `authenticated` Postgres role. The robust fence is
-- to move admin_summary into its own table whose RLS admits admins only, so the
-- over_shepherd coverage policy never reaches it.
-- (docs/adr/0002-oversight-ladder-and-leader-gating.md.)

-- ---------------------------------------------------------------------------
-- 1. New admin-only table, 1:1 with a care profile.
-- ---------------------------------------------------------------------------
create table public.shepherd_care_admin_notes (
  care_profile_id uuid primary key
    references public.shepherd_care_profiles(id) on delete cascade,
  admin_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.shepherd_care_admin_notes is
  'Phase OS.5 admin-only private care summary, split out of shepherd_care_profiles so RLS can fence it from the over_shepherd coverage policy. One row per care profile. Writes only via the SECURITY DEFINER care RPCs.';

-- ---------------------------------------------------------------------------
-- 2. RLS: admin-only SELECT (same posture as shepherd_care_profiles —
--    auth_is_admin(), NOT auth_is_admin_or_staff(); over_shepherd is never
--    admitted). No INSERT/UPDATE/DELETE policies: writes only via the
--    SECURITY DEFINER RPC below. The table-level SELECT grant to
--    `authenticated` is required for the policy to be evaluated at all
--    (matches the foundation migration's grant pattern).
-- ---------------------------------------------------------------------------
alter table public.shepherd_care_admin_notes enable row level security;

create policy shepherd_care_admin_notes_admin_select
  on public.shepherd_care_admin_notes
  for select to authenticated using (public.auth_is_admin());

grant select on public.shepherd_care_admin_notes to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Backfill existing summaries before dropping the source column.
-- ---------------------------------------------------------------------------
insert into public.shepherd_care_admin_notes (care_profile_id, admin_summary)
select id, admin_summary
  from public.shepherd_care_profiles
 where admin_summary is not null;

-- ---------------------------------------------------------------------------
-- 4. Re-create the upsert RPC to persist the summary in the new table.
--    Reproduced from 20260518160000_phase5d0_shepherd_care_foundation.sql with
--    the admin_summary persistence redirected; signature is UNCHANGED so the
--    app write path (validation + rpc wrapper) is untouched. CREATE OR REPLACE
--    preserves the existing EXECUTE grants.
-- ---------------------------------------------------------------------------
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
  v_before_has_summary boolean;
  v_after_has_summary boolean;
  v_persisted_status public.shepherd_care_status;
  v_persisted_next_touchpoint date;
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

  -- Defense-in-depth: callers that bypass the validation layer must still
  -- update at least one field. The flags are explicitly coalesced because
  -- `null OR null OR null` evaluates to NULL and `IF NOT (NULL)` does NOT
  -- execute, so a caller passing NULL for all three flags would otherwise
  -- slip past this guard.
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

  -- Race-safety: INSERT-DO-NOTHING guarantees the row exists, the
  -- subsequent SELECT FOR UPDATE serializes concurrent writers, and the
  -- UPDATE then runs against a locked row whose pre-state is captured in
  -- v_existing (see the original phase5d0 migration for the full rationale).
  insert into public.shepherd_care_profiles (shepherd_profile_id, current_status)
  values (p_shepherd_profile_id, 'healthy'::public.shepherd_care_status)
  on conflict (shepherd_profile_id) do nothing
  returning id into v_inserted_id;

  v_was_just_created := v_inserted_id is not null;

  select id, current_status, next_touchpoint_due
    into v_existing
    from public.shepherd_care_profiles
   where shepherd_profile_id = p_shepherd_profile_id
   for update;

  -- Summary presence BEFORE the write, read from the fenced notes table
  -- under the same transaction (note bodies are never put in audit metadata,
  -- only a presence flag).
  select (admin_summary is not null)
    into v_before_has_summary
    from public.shepherd_care_admin_notes
   where care_profile_id = v_existing.id;
  v_before_has_summary := coalesce(v_before_has_summary, false);

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
         updated_at = now()
   where shepherd_profile_id = p_shepherd_profile_id
  returning id, current_status, next_touchpoint_due
       into v_new_id, v_persisted_status, v_persisted_next_touchpoint;

  -- Persist the summary in the fenced table. A null v_summary (cleared
  -- summary) is written through, so clearing is recorded as has_summary=false.
  if p_set_admin_summary then
    insert into public.shepherd_care_admin_notes (care_profile_id, admin_summary, updated_at)
    values (v_new_id, v_summary, now())
    on conflict (care_profile_id) do update
      set admin_summary = excluded.admin_summary,
          updated_at = now();
    v_after_has_summary := v_summary is not null;
  else
    v_after_has_summary := v_before_has_summary;
  end if;

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
        'has_summary', v_before_has_summary
      ),
      'after', jsonb_build_object(
        'current_status', v_persisted_status,
        'next_touchpoint_due', v_persisted_next_touchpoint,
        'has_summary', v_after_has_summary
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
-- 5. Drop the now-relocated column. Done last so the backfill above could
--    still read it; the replaced RPC no longer references it.
-- ---------------------------------------------------------------------------
alter table public.shepherd_care_profiles drop column admin_summary;
