-- Phase SC.4 (lifecycle): private-note key-slot lifecycle. Resolves issue #113.
--
-- Builds on the #112 tracer (20260529008000): the tables, creator-scoped RLS,
-- enroll + upsert RPCs, and the dependency-free crypto module already exist.
-- This migration adds the SECURITY DEFINER RPCs for managing unlock methods:
--   * add a SECOND passkey (re-wrap the SAME DEK into a new slot; no note
--     re-encryption),
--   * rotate the recovery code (replace the recovery slot atomically so the old
--     code stops unlocking the instant the new one is issued),
--   * remove a passkey slot (never the last remaining slot; recovery is rotated,
--     not removed).
--
-- Same privacy posture as #112: each RPC gates on the ministry_admin role,
-- derives the creator from the actor (never a client argument), writes a paired
-- audit_events row carrying PRESENCE/LABELS ONLY, and is EXECUTE-locked to
-- authenticated. super_admin is excluded. No RLS policy or table grant changes
-- (the #112 creator-scoped SELECT policies still apply).
--
-- Bytea wire contract (unchanged): the wrapped-key columns travel as base64
-- text and are decoded with decode(arg, 'base64'); fixed lengths are enforced
-- (hkdf_salt 16, wrap_iv 12, wrapped_dek 48 = 32-byte DEK + 16-byte tag, prf_salt
-- 32). The new slot inherits the creator's existing DEK generation.
--
-- Deviation (consistent with #112, see docs/SC_4_HANDOFF_CONTRACT.md):
-- admin_remove_private_note_key_slot returns the removed slot's uuid rather than
-- void, so it flows through the standard admin write-action runner.
--
-- Fixed error tokens raised by these functions (mapped to friendly messages by
-- lib/admin/action-result.ts):
--   insufficient_privilege, invalid_input, not_enrolled, missing_slot,
--   cannot_remove_last_slot.

-- ---------------------------------------------------------------------------
-- 1. admin_add_private_note_key_slot
--    Add a passkey slot wrapping the existing DEK. Recovery slots are NOT added
--    here (use admin_rotate_private_note_recovery).
-- ---------------------------------------------------------------------------

create or replace function public.admin_add_private_note_key_slot(
  p_slot_type text,
  p_credential_id text,  -- base64
  p_label text,
  p_prf_salt text,       -- base64
  p_hkdf_salt text,      -- base64
  p_wrapped_dek text,    -- base64
  p_wrap_iv text         -- base64
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_dek_version smallint;
  v_new_id uuid;
begin
  if not (public.auth_role() = 'ministry_admin'::public.user_role) then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  -- Only passkey slots are added here; a recovery slot is rotated, never added,
  -- so the partial-unique single-recovery index can never be violated.
  if p_slot_type = 'recovery' then
    raise exception 'invalid_input';
  end if;
  if p_slot_type <> 'passkey' then
    raise exception 'invalid_input';
  end if;
  if p_credential_id is null or p_prf_salt is null
     or p_hkdf_salt is null or p_wrapped_dek is null or p_wrap_iv is null then
    raise exception 'invalid_input';
  end if;
  if octet_length(decode(p_hkdf_salt, 'base64')) <> 16
     or octet_length(decode(p_wrap_iv, 'base64')) <> 12
     or octet_length(decode(p_wrapped_dek, 'base64')) <> 48
     or octet_length(decode(p_prf_salt, 'base64')) <> 32 then
    raise exception 'invalid_input';
  end if;

  -- The new slot inherits the creator's existing DEK generation; you cannot add
  -- a slot before enrolling.
  select dek_version
    into v_dek_version
    from public.shepherd_care_note_key_slots
   where created_by_profile_id = v_actor
   order by created_at
   limit 1;
  if v_dek_version is null then
    raise exception 'not_enrolled';
  end if;

  insert into public.shepherd_care_note_key_slots (
    created_by_profile_id, dek_version, slot_type, credential_id, label,
    prf_salt, hkdf_salt, wrapped_dek, wrap_iv
  ) values (
    v_actor,
    v_dek_version,
    'passkey',
    decode(p_credential_id, 'base64'),
    nullif(btrim(coalesce(p_label, '')), ''),
    decode(p_prf_salt, 'base64'),
    decode(p_hkdf_salt, 'base64'),
    decode(p_wrapped_dek, 'base64'),
    decode(p_wrap_iv, 'base64')
  )
  returning id into v_new_id;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.shepherd_care.private_note.add_slot',
    'shepherd_care_note_key_slots',
    v_new_id,
    jsonb_build_object(
      'slot_type', 'passkey',
      'dek_version', v_dek_version,
      'has_label', nullif(btrim(coalesce(p_label, '')), '') is not null
    )
  );

  return v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. admin_rotate_private_note_recovery
--    Replace the recovery slot in ONE transaction: delete the existing recovery
--    slot, insert the replacement. The old recovery code stops unlocking the
--    instant the new one is issued.
-- ---------------------------------------------------------------------------

create or replace function public.admin_rotate_private_note_recovery(
  p_hkdf_salt text,    -- base64
  p_wrapped_dek text,  -- base64
  p_wrap_iv text,      -- base64
  p_label text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_dek_version smallint;
  v_new_id uuid;
begin
  if not (public.auth_role() = 'ministry_admin'::public.user_role) then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_hkdf_salt is null or p_wrapped_dek is null or p_wrap_iv is null then
    raise exception 'invalid_input';
  end if;
  if octet_length(decode(p_hkdf_salt, 'base64')) <> 16
     or octet_length(decode(p_wrap_iv, 'base64')) <> 12
     or octet_length(decode(p_wrapped_dek, 'base64')) <> 48 then
    raise exception 'invalid_input';
  end if;

  select dek_version
    into v_dek_version
    from public.shepherd_care_note_key_slots
   where created_by_profile_id = v_actor
   order by created_at
   limit 1;
  if v_dek_version is null then
    raise exception 'not_enrolled';
  end if;

  -- Atomic replace: drop the old recovery slot, then insert the new one.
  delete from public.shepherd_care_note_key_slots
   where created_by_profile_id = v_actor
     and dek_version = v_dek_version
     and slot_type = 'recovery';

  insert into public.shepherd_care_note_key_slots (
    created_by_profile_id, dek_version, slot_type, credential_id, label,
    prf_salt, hkdf_salt, wrapped_dek, wrap_iv
  ) values (
    v_actor,
    v_dek_version,
    'recovery',
    null,
    nullif(btrim(coalesce(p_label, '')), ''),
    null,
    decode(p_hkdf_salt, 'base64'),
    decode(p_wrapped_dek, 'base64'),
    decode(p_wrap_iv, 'base64')
  )
  returning id into v_new_id;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.shepherd_care.private_note.rotate_recovery',
    'shepherd_care_note_key_slots',
    v_new_id,
    jsonb_build_object(
      'slot_type', 'recovery',
      'dek_version', v_dek_version,
      'rotated', true
    )
  );

  return v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. admin_remove_private_note_key_slot
--    Remove one of the creator's passkey slots. Never the last remaining slot;
--    recovery slots are rotated, not removed.
-- ---------------------------------------------------------------------------

create or replace function public.admin_remove_private_note_key_slot(
  p_slot_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_slot_type text;
  v_dek_version smallint;
  v_remaining integer;
begin
  if not (public.auth_role() = 'ministry_admin'::public.user_role) then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_slot_id is null then
    raise exception 'invalid_input';
  end if;

  select slot_type, dek_version
    into v_slot_type, v_dek_version
    from public.shepherd_care_note_key_slots
   where id = p_slot_id
     and created_by_profile_id = v_actor
   limit 1;
  if v_slot_type is null then
    raise exception 'missing_slot';
  end if;

  -- Recovery is the mandatory backstop; rotate it, never remove it.
  if v_slot_type = 'recovery' then
    raise exception 'invalid_input';
  end if;

  select count(*)
    into v_remaining
    from public.shepherd_care_note_key_slots
   where created_by_profile_id = v_actor;
  if v_remaining <= 1 then
    raise exception 'cannot_remove_last_slot';
  end if;

  delete from public.shepherd_care_note_key_slots
   where id = p_slot_id
     and created_by_profile_id = v_actor;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.shepherd_care.private_note.remove_slot',
    'shepherd_care_note_key_slots',
    p_slot_id,
    jsonb_build_object(
      'slot_type', v_slot_type,
      'dek_version', v_dek_version
    )
  );

  return p_slot_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Revoke from public/anon/authenticated, then grant execute to
-- authenticated only. The ministry_admin role gate in each body is the real
-- boundary.
-- ---------------------------------------------------------------------------

revoke all on function public.admin_add_private_note_key_slot(
  text, text, text, text, text, text, text
) from public;
revoke all on function public.admin_add_private_note_key_slot(
  text, text, text, text, text, text, text
) from anon;
revoke all on function public.admin_add_private_note_key_slot(
  text, text, text, text, text, text, text
) from authenticated;
grant execute on function public.admin_add_private_note_key_slot(
  text, text, text, text, text, text, text
) to authenticated;

revoke all on function public.admin_rotate_private_note_recovery(text, text, text, text) from public;
revoke all on function public.admin_rotate_private_note_recovery(text, text, text, text) from anon;
revoke all on function public.admin_rotate_private_note_recovery(text, text, text, text) from authenticated;
grant execute on function public.admin_rotate_private_note_recovery(text, text, text, text) to authenticated;

revoke all on function public.admin_remove_private_note_key_slot(uuid) from public;
revoke all on function public.admin_remove_private_note_key_slot(uuid) from anon;
revoke all on function public.admin_remove_private_note_key_slot(uuid) from authenticated;
grant execute on function public.admin_remove_private_note_key_slot(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Function docs
-- ---------------------------------------------------------------------------

comment on function public.admin_add_private_note_key_slot(
  text, text, text, text, text, text, text
) is
  'Phase SC.4 (#113) admin write: adds a passkey key slot wrapping the creator''s existing DEK (no note re-encryption), plus an audit_events row. Wrapped DEK / salts are NEVER stored in audit metadata.';

comment on function public.admin_rotate_private_note_recovery(text, text, text, text) is
  'Phase SC.4 (#113) admin write: atomically replaces the creator''s recovery slot so the old recovery code stops unlocking, plus an audit_events row. Key material is NEVER stored in audit metadata.';

comment on function public.admin_remove_private_note_key_slot(uuid) is
  'Phase SC.4 (#113) admin write: removes one of the creator''s passkey slots (never the last remaining slot; recovery is rotated, not removed), plus an audit_events row.';
