-- Julian feedback Q2 (PRD Q2 / ADR 0004 D2): adopt Julian's five Leader Care
-- Status values verbatim. RESOLVED in grill 2026-05-30 (docs PR #130), so this
-- is purely mechanical: rename the three existing enum values to Julian's
-- vocabulary and add the two net-new ones.
--
--   Today            -> New
--   healthy          -> doing_well
--   watch            -> needs_encouragement
--   needs_attention  -> needs_follow_up
--   (net-new)        -> concern        (populated by hand later)
--   (net-new)        -> inactive       (lifecycle state, not a severity)
--
-- We use ALTER TYPE ... RENAME VALUE rather than recreating the type with a
-- USING cast: a rename preserves each value's underlying OID, so every
-- existing shepherd_care_profiles row is backfilled to the new label
-- automatically with no data copy and no escalation risk. needs_attention maps
-- to the milder needs_follow_up (NOT concern) so the migration never silently
-- escalates a record.
--
-- `inactive` is a lifecycle state, not a severity level. `needs_follow_up`
-- also exists in group_health_status (the Health Pulse) — distinct enum types,
-- distinct concepts (see CONTEXT.md). This migration touches only
-- shepherd_care_status.
--
-- Function bodies reference the old `'healthy'` label as a string literal,
-- which is re-parsed at call time; after the rename that literal would be an
-- invalid enum input. So the two live care-write RPCs are recreated below with
-- the literal updated to `'doing_well'`. Their signatures are UNCHANGED, so the
-- app write path (validation + rpc wrapper) is untouched, and CREATE OR REPLACE
-- preserves the existing EXECUTE grants. The precedent for ADD VALUE in a
-- migration is 20260529000000_phase_os1_over_shepherd_role.sql.

-- ---------------------------------------------------------------------------
-- 1. Rename the three existing values; data backfills automatically.
-- ---------------------------------------------------------------------------
alter type public.shepherd_care_status rename value 'healthy' to 'doing_well';
alter type public.shepherd_care_status rename value 'watch' to 'needs_encouragement';
alter type public.shepherd_care_status rename value 'needs_attention' to 'needs_follow_up';

-- ---------------------------------------------------------------------------
-- 2. Add the two net-new values (appended after the renamed three so the enum
--    sort order reads doing_well < needs_encouragement < needs_follow_up <
--    concern < inactive). Idempotent for re-runs.
-- ---------------------------------------------------------------------------
alter type public.shepherd_care_status add value if not exists 'concern';
alter type public.shepherd_care_status add value if not exists 'inactive';

-- ---------------------------------------------------------------------------
-- 3. Reset the column default to the renamed baseline value, explicitly. The
--    stored default already resolves to the same member post-rename, but we
--    re-state it so a schema dump reads the new vocabulary.
-- ---------------------------------------------------------------------------
alter table public.shepherd_care_profiles
  alter column current_status set default 'doing_well';

-- ---------------------------------------------------------------------------
-- 4. Recreate admin_upsert_shepherd_care_profile (latest definition is
--    20260529004000_phase_os5_fence_admin_summary.sql) with the lazy-insert
--    default literal changed 'healthy' -> 'doing_well'. Body otherwise verbatim.
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

  insert into public.shepherd_care_profiles (shepherd_profile_id, current_status)
  values (p_shepherd_profile_id, 'doing_well'::public.shepherd_care_status)
  on conflict (shepherd_profile_id) do nothing
  returning id into v_inserted_id;

  v_was_just_created := v_inserted_id is not null;

  select id, current_status, next_touchpoint_due
    into v_existing
    from public.shepherd_care_profiles
   where shepherd_profile_id = p_shepherd_profile_id
   for update;

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
-- 5. Recreate admin_log_shepherd_care_interaction (latest definition is
--    20260518160000_phase5d0_shepherd_care_foundation.sql) with the two
--    lazy-insert default literals changed 'healthy' -> 'doing_well'. Body
--    otherwise verbatim.
-- ---------------------------------------------------------------------------
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
  if p_interaction_at > ((now() at time zone 'UTC')::date + 1) then
    raise exception 'invalid_input';
  end if;

  v_notes := nullif(btrim(coalesce(p_notes, '')), '');
  if v_notes is not null and length(v_notes) > 2000 then
    raise exception 'invalid_input';
  end if;

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

  insert into public.shepherd_care_profiles (
    shepherd_profile_id, current_status, last_contact_at, next_touchpoint_due
  ) values (
    p_shepherd_profile_id,
    case when p_set_current_status then coalesce(p_current_status, 'doing_well'::public.shepherd_care_status)
         else 'doing_well'::public.shepherd_care_status end,
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
