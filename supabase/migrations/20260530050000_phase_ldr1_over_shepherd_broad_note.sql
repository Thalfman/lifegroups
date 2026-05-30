-- Phase LDR.1 (#126): over-shepherd broad-note write.
--
-- Derived from PRD Q7 / ADR 0004 / D4. Julian's systems conversation (Q7):
-- over-shepherds may eventually help update the system too — but BROAD NOTES
-- ONLY, given simplicity and confidentiality. The Over-Shepherd login tier,
-- coverage assignments, and coverage-scoped *read* RLS already ship; only
-- *write* was deferred. This opens one narrow write path.
--
-- Posture (docs/adr/0002-oversight-ladder-and-leader-gating.md, AGENTS.md):
--   * No service-role key in the Next runtime — the write goes through this
--     SECURITY DEFINER RPC, called via runAdminWriteAction.
--   * No write RLS policy on shepherd_care_interactions (the foundation
--     migration deliberately omits one): direct writes are denied for every
--     authenticated caller, so this RPC is the ONLY writer. It refuses any
--     Shepherd outside the caller's active coverage (auth_over_shepherd_covers).
--   * Paired audit_events row in the same transaction. The note body is NEVER
--     stored in audit metadata — only a presence flag — matching the admin
--     care RPCs.
--   * Strictly a broad note: this path never touches admin_summary (fenced in
--     shepherd_care_admin_notes), the private encrypted notes, the care status,
--     or the next-touchpoint. The over-shepherd surface exposes only the note.
--   * The staleness clock resets on Ministry-Admin interactions only (#123).
--     An over-shepherd broad note therefore does NOT move last_contact_at: the
--     lazy care-profile create leaves it null and an existing row is untouched.
--
-- A broad-note interaction is a normal shepherd_care_interactions row, so it is
-- readable up the ladder (Over-Shepherd ▸ Ministry Admin ▸ Super Admin) via the
-- existing reads — downward visibility per ADR 0002.
--
-- Fixed error tokens (mapped by lib/admin/action-result.ts):
--   insufficient_privilege, not_covered, invalid_input, missing_profile.

create or replace function public.over_shepherd_log_broad_note(
  p_shepherd_profile_id uuid,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_over_shepherd_id uuid;
  v_target record;
  v_note text;
  v_care_profile_id uuid;
  v_interaction_id uuid;
  -- Anchored to UTC so it agrees with the rest of the care date math
  -- (matches the admin interaction RPC's now()-at-UTC cap).
  v_interaction_at date := (now() at time zone 'UTC')::date;
begin
  -- Caller must resolve to a single active over-shepherd via the OS.2 bridge.
  v_over_shepherd_id := public.auth_over_shepherd_id();
  if v_over_shepherd_id is null then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_shepherd_profile_id is null then
    raise exception 'invalid_input';
  end if;

  -- Coverage gate: the narrow authorization boundary. The over-shepherd may
  -- only write a note on a Shepherd they actively cover; any other target is
  -- refused (this is the negative path the cross-coverage test exercises).
  if not public.auth_over_shepherd_covers(p_shepherd_profile_id) then
    raise exception 'not_covered';
  end if;

  -- A broad note is required and bounded; trimmed to null/empty is rejected.
  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is null then
    raise exception 'invalid_input';
  end if;
  if length(v_note) > 2000 then
    raise exception 'invalid_input';
  end if;

  -- Target must be an active leader / co_leader — the same boundary the admin
  -- care RPCs enforce. Defense-in-depth on top of the coverage gate.
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

  -- Lazy-create the care profile WITHOUT touching last_contact_at: the
  -- staleness clock is Ministry-Admin-only (#123). current_status is left to
  -- the column default (no enum literal here, so this function is independent
  -- of the care-status vocabulary). An existing row is left entirely as-is.
  insert into public.shepherd_care_profiles (shepherd_profile_id)
  values (p_shepherd_profile_id)
  on conflict (shepherd_profile_id) do nothing;

  select id
    into v_care_profile_id
    from public.shepherd_care_profiles
   where shepherd_profile_id = p_shepherd_profile_id;

  -- Append the broad note. interaction_type is fixed to 'other' — the
  -- over-shepherd surface exposes only the note field (no type picker, no
  -- status / touchpoint edit, no admin_summary, no private note).
  insert into public.shepherd_care_interactions (
    care_profile_id, interaction_at, interaction_type, notes, created_by_profile_id
  ) values (
    v_care_profile_id,
    v_interaction_at,
    'other'::public.shepherd_care_interaction_type,
    v_note,
    v_actor
  )
  returning id into v_interaction_id;

  -- Paired audit row in the same transaction. The note body is NEVER written
  -- to audit metadata — only has_note — so the audit log stays shareable
  -- without leaking pastoral context.
  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'over_shepherd.log_broad_note',
    'shepherd_care_interactions',
    v_interaction_id,
    jsonb_build_object(
      'over_shepherd_id', v_over_shepherd_id,
      'shepherd_profile_id', p_shepherd_profile_id,
      'care_profile_id', v_care_profile_id,
      'interaction_at', v_interaction_at,
      'has_note', true
    )
  );

  return v_interaction_id;
end;
$$;

-- Revoke from public/anon/authenticated, then grant execute to authenticated
-- only. The body still enforces the over-shepherd identity + coverage gate, so
-- granting execute to authenticated only makes the function callable.
revoke all on function public.over_shepherd_log_broad_note(uuid, text) from public;
revoke all on function public.over_shepherd_log_broad_note(uuid, text) from anon;
revoke all on function public.over_shepherd_log_broad_note(uuid, text) from authenticated;
grant execute on function public.over_shepherd_log_broad_note(uuid, text) to authenticated;

comment on function public.over_shepherd_log_broad_note(uuid, text) is
  'Phase LDR.1 (#126) over-shepherd write: appends a broad-note shepherd_care_interactions row on a Shepherd the caller actively covers (auth_over_shepherd_covers), plus a paired audit_events row. Never touches last_contact_at, care status, admin_summary, or private notes. Note body is NOT stored in audit metadata.';
