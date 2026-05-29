-- Phase OS.4: Over-Shepherd care write — log broad care interactions.
--
-- Gives an Over-Shepherd the write half of their care surface
-- (docs/adr/0002-oversight-ladder-and-leader-gating.md): the ability to log a
-- BROAD care interaction on a Shepherd they actively cover. Scoped to
-- interactions-only — the care-follow-up half (setting status / next
-- touchpoint) depends on the unresolved SC.1B model and is split into a
-- follow-on issue, so this RPC never sets current_status, next_touchpoint_due,
-- or the admin-only admin_summary.
--
-- Defense lives at the RPC, not the UI: a narrow SECURITY DEFINER function
-- that re-checks the coverage predicate for the caller, inserts the
-- interaction, and writes audit_events in the SAME transaction. No broad write
-- RLS policy is introduced; no hard deletes; audit metadata records presence
-- flags only (has_notes), never note bodies.

create or replace function public.over_shepherd_log_care_interaction(
  p_shepherd_profile_id uuid,
  p_interaction_at date,
  p_interaction_type public.shepherd_care_interaction_type,
  p_notes text
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
begin
  -- Identity: the caller must resolve to a single active over-shepherd roster
  -- row (email-collision policy enforced inside auth_over_shepherd_id()).
  if public.auth_over_shepherd_id() is null then
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

  -- Coverage re-check at the RPC, independent of any UI state. Logging
  -- against a Shepherd the caller does NOT actively cover is denied here.
  if not public.auth_over_shepherd_covers(p_shepherd_profile_id) then
    raise exception 'not_covered';
  end if;

  -- Future-dated interactions are rejected (matches the admin RPC + the TS
  -- validator's UTC today + 1 cap, accommodating callers ahead of UTC).
  if p_interaction_at > ((now() at time zone 'UTC')::date + 1) then
    raise exception 'invalid_input';
  end if;

  v_notes := nullif(btrim(coalesce(p_notes, '')), '');
  if v_notes is not null and length(v_notes) > 2000 then
    raise exception 'invalid_input';
  end if;

  -- Target must be an active leader / co_leader (same gating as the admin
  -- RPC). Coverage already implies this, but re-checking is cheap defense.
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

  -- Lazy-create / touch the care profile in the same transaction. An
  -- Over-Shepherd advances ONLY last_contact_at (monotonically forward); they
  -- never write current_status, next_touchpoint_due, or admin_summary — those
  -- keep their defaults / existing values. (Status + touchpoint are the
  -- SC.1B care-follow-up half, deferred to a follow-on issue; admin_summary is
  -- admin-only and creator-private.)
  insert into public.shepherd_care_profiles (
    shepherd_profile_id, last_contact_at
  ) values (
    p_shepherd_profile_id, p_interaction_at
  )
  on conflict (shepherd_profile_id) do update
    set last_contact_at = greatest(
          coalesce(public.shepherd_care_profiles.last_contact_at, '1900-01-01'::date),
          p_interaction_at
        ),
        updated_at = now()
  returning id into v_care_profile_id;

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
    'over_shepherd.log_shepherd_care_interaction',
    'shepherd_care_interactions',
    v_interaction_id,
    jsonb_build_object(
      'after', jsonb_build_object(
        'interaction_type', p_interaction_type,
        'interaction_at', p_interaction_at,
        -- Presence flag only — the note body is never written to audit.
        'has_notes', v_notes is not null,
        'care_profile_id', v_care_profile_id
      ),
      'shepherd_profile_id', p_shepherd_profile_id
    )
  );

  return v_interaction_id;
end;
$$;

revoke all on function public.over_shepherd_log_care_interaction(
  uuid, date, public.shepherd_care_interaction_type, text
) from public;
revoke all on function public.over_shepherd_log_care_interaction(
  uuid, date, public.shepherd_care_interaction_type, text
) from anon;
grant execute on function public.over_shepherd_log_care_interaction(
  uuid, date, public.shepherd_care_interaction_type, text
) to authenticated;
