-- Phase SC.4: Private care notes (zero-knowledge, client-side encryption).
-- Resolves issue #112 (the tracer-bullet slice).
--
-- A Ministry Admin records a pastoral note "readable by him alone". The body is
-- stored as CIPHERTEXT ONLY: encrypted and decrypted client-side under a
-- per-creator Data-Encryption-Key the server never holds. See
-- docs/SC_4_PRIVATE_CARE_NOTES_SPEC.md and docs/adr/0003-private-care-note-encryption.md.
--
-- Two tables: per-note ciphertext (shepherd_care_private_notes) and the
-- per-creator wrapped-DEK key slots (shepherd_care_note_key_slots). Both are
-- defense-in-depth fences over the encryption, modelled on the OS.5 fenced
-- admin-notes table (20260529004000) but ONE NOTCH STRICTER: their RLS is
-- CREATOR-scoped, not admin-scoped.
--
-- Privacy posture (stricter than the rest of the care module):
--   * RLS SELECT is gated on the ministry_admin role specifically AND a
--     created_by_profile_id = auth_profile_id() match. This EXCLUDES every other
--     ministry_admin, the super_admin (the one deliberate inversion of the
--     oversight ladder, per CONTEXT.md and docs/adr/0002), and of course every
--     leader / co_leader / over_shepherd / staff_viewer. The wrapped DEK is
--     useless without the creator's secret, but RLS still fences the key-slot
--     table so device-label / slot metadata never leaks.
--   * NO insert/update/delete policies. All writes go through the SECURITY
--     DEFINER RPCs below, which gate on the ministry_admin role inside the
--     function body, derive created_by_profile_id from the actor (never a client
--     argument), and write a paired audit_events row in the same transaction.
--   * No hard deletes. Corrections happen via re-encryption / re-wrapping.
--   * Audit metadata is PRESENCE/LIFECYCLE ONLY. The server only ever holds
--     ciphertext, so it cannot record content even in principle: never the body,
--     the wrapped DEK, the salts, the recovery code, or the DEK.
--
-- Bytea wire contract: the RPCs accept the bytea columns as base64 text and
-- decode(arg, 'base64'); PostgREST cannot coerce a JSON value straight into
-- bytea. Reads return PostgreSQL's default hex bytea output, normalised to
-- base64 by the read model. The TS argument types are `string` either way.
--
-- Deviation from the spec (flagged for #113/#114): admin_enroll_private_note_keys
-- returns the mandatory recovery slot's uuid rather than `void`, so it flows
-- through the standard admin write-action runner (which treats a void return as
-- failure) exactly like every sibling care RPC. It leaks nothing — the id is a
-- random slot id the creator already owns.
--
-- Fixed error tokens raised by these functions (mapped to friendly messages by
-- lib/admin/action-result.ts):
--   insufficient_privilege, invalid_input, missing_care_profile, missing_profile,
--   missing_recovery_slot, already_enrolled.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- Per-note ciphertext. No plaintext column exists.
create table public.shepherd_care_private_notes (
  id uuid primary key default gen_random_uuid(),
  care_profile_id uuid not null
    references public.shepherd_care_profiles(id) on delete cascade,
  created_by_profile_id uuid not null
    references public.profiles(id) on delete restrict,
  ciphertext bytea not null,                 -- AES-256-GCM output (ct || 128-bit tag)
  iv bytea not null,                         -- 12-byte (96-bit) random nonce
  dek_version smallint not null default 1,   -- which DEK generation encrypted this row
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.shepherd_care_private_notes is
  'Phase SC.4 per-note ciphertext for the Ministry Admin private care note. Body is AES-256-GCM ciphertext encrypted client-side; the server never holds plaintext or the key. Creator-scoped RLS (excludes super_admin). Writes only via the SECURITY DEFINER RPC. One row per (care_profile_id, created_by_profile_id).';

-- Per-creator key material: the DEK, wrapped once per unlock method ("slot").
create table public.shepherd_care_note_key_slots (
  id uuid primary key default gen_random_uuid(),
  created_by_profile_id uuid not null
    references public.profiles(id) on delete restrict,
  dek_version smallint not null default 1,
  slot_type text not null check (slot_type in ('passkey', 'recovery')),
  credential_id bytea,                       -- WebAuthn credential id (passkey slots); null for recovery
  label text,                                -- e.g. "Windows Hello (laptop)", "Recovery code"
  prf_salt bytea,                            -- WebAuthn PRF eval input (passkey slots); null for recovery
  hkdf_salt bytea not null,                  -- 16-byte salt for HKDF-SHA256 -> KEK
  wrapped_dek bytea not null,                -- DEK encrypted under the KEK (AES-256-GCM, ct || tag)
  wrap_iv bytea not null,                    -- 12-byte nonce for the wrap
  created_at timestamptz not null default now()
);

comment on table public.shepherd_care_note_key_slots is
  'Phase SC.4 per-creator wrapped-DEK key slots, one row per unlock method (passkey or recovery code). Holds only ciphertext key material and non-secret salts; useless without the creator''s passkey PRF output or recovery code. Creator-scoped RLS (excludes super_admin). Writes only via the SECURITY DEFINER RPCs.';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- One private note per creator per care profile (the per-creator boundary).
create unique index shepherd_care_private_notes_profile_creator_uniq
  on public.shepherd_care_private_notes (care_profile_id, created_by_profile_id);

create index shepherd_care_note_key_slots_creator_idx
  on public.shepherd_care_note_key_slots (created_by_profile_id);

-- At most ONE recovery slot per creator per DEK generation, so rotating the
-- recovery code replaces (never accumulates) it. Passkey slots are unconstrained.
create unique index shepherd_care_note_key_slots_one_recovery_uniq
  on public.shepherd_care_note_key_slots (created_by_profile_id, dek_version)
  where slot_type = 'recovery';

-- ---------------------------------------------------------------------------
-- RLS — creator-scoped SELECT on both tables, no write policies.
-- ---------------------------------------------------------------------------

alter table public.shepherd_care_private_notes enable row level security;
alter table public.shepherd_care_note_key_slots enable row level security;

create policy shepherd_care_private_notes_creator_select
  on public.shepherd_care_private_notes
  for select to authenticated
  using (
    public.auth_role() = 'ministry_admin'::public.user_role
    and created_by_profile_id = public.auth_profile_id()
  );

create policy shepherd_care_note_key_slots_creator_select
  on public.shepherd_care_note_key_slots
  for select to authenticated
  using (
    public.auth_role() = 'ministry_admin'::public.user_role
    and created_by_profile_id = public.auth_profile_id()
  );

-- Table-level SELECT grant is required for the RLS policy to be evaluated at
-- all (RLS sits on top of table privileges). NO insert/update/delete grants.
grant select on public.shepherd_care_private_notes to authenticated;
grant select on public.shepherd_care_note_key_slots to authenticated;

-- ---------------------------------------------------------------------------
-- 1. admin_enroll_private_note_keys
--    Initial enrollment: create the first key slots. A recovery slot is
--    MANDATORY (the offline backstop / universal fallback); passkey slots are
--    optional. Rejects a slot set with no recovery slot. Returns the recovery
--    slot id (see the deviation note in the header).
-- ---------------------------------------------------------------------------

create or replace function public.admin_enroll_private_note_keys(
  p_dek_version smallint,
  p_slots jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_slot jsonb;
  v_slot_type text;
  v_slot_count integer := 0;
  v_recovery_count integer := 0;
  v_inserted_id uuid;
  v_recovery_slot_id uuid;
begin
  if not (public.auth_role() = 'ministry_admin'::public.user_role) then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_dek_version is null or p_slots is null or jsonb_typeof(p_slots) <> 'array' then
    raise exception 'invalid_input';
  end if;

  -- Enrollment is once-per-creator. Adding further slots is #113's job.
  perform 1
    from public.shepherd_care_note_key_slots
   where created_by_profile_id = v_actor
   limit 1;
  if found then
    raise exception 'already_enrolled';
  end if;

  for v_slot in select value from jsonb_array_elements(p_slots)
  loop
    v_slot_count := v_slot_count + 1;
    v_slot_type := v_slot->>'slot_type';
    if v_slot_type is null or v_slot_type not in ('passkey', 'recovery') then
      raise exception 'invalid_input';
    end if;
    if v_slot->>'hkdf_salt' is null
       or v_slot->>'wrapped_dek' is null
       or v_slot->>'wrap_iv' is null then
      raise exception 'invalid_input';
    end if;

    insert into public.shepherd_care_note_key_slots (
      created_by_profile_id, dek_version, slot_type, credential_id, label,
      prf_salt, hkdf_salt, wrapped_dek, wrap_iv
    ) values (
      v_actor,
      p_dek_version,
      v_slot_type,
      case when v_slot->>'credential_id' is not null
        then decode(v_slot->>'credential_id', 'base64') else null end,
      nullif(btrim(coalesce(v_slot->>'label', '')), ''),
      case when v_slot->>'prf_salt' is not null
        then decode(v_slot->>'prf_salt', 'base64') else null end,
      decode(v_slot->>'hkdf_salt', 'base64'),
      decode(v_slot->>'wrapped_dek', 'base64'),
      decode(v_slot->>'wrap_iv', 'base64')
    )
    returning id into v_inserted_id;

    if v_slot_type = 'recovery' then
      v_recovery_count := v_recovery_count + 1;
      v_recovery_slot_id := v_inserted_id;
    end if;
  end loop;

  if v_slot_count = 0 then
    raise exception 'invalid_input';
  end if;
  if v_recovery_count = 0 then
    raise exception 'missing_recovery_slot';
  end if;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.shepherd_care.private_note.enroll',
    'shepherd_care_note_key_slots',
    v_recovery_slot_id,
    jsonb_build_object(
      'dek_version', p_dek_version,
      'slot_count', v_slot_count,
      'has_recovery_slot', true
    )
  );

  return v_recovery_slot_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. admin_upsert_shepherd_care_private_note
--    Upsert a note's ciphertext on the (care_profile_id, created_by_profile_id)
--    key. Tri-state p_set_body: only writes ciphertext/iv when true.
-- ---------------------------------------------------------------------------

create or replace function public.admin_upsert_shepherd_care_private_note(
  p_care_profile_id uuid,
  p_ciphertext text,   -- base64; decoded to bytea below
  p_iv text,           -- base64; decoded to bytea below
  p_dek_version smallint,
  p_set_body boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_shepherd_role public.user_role;
  v_shepherd_status public.profile_status;
  v_ciphertext bytea;
  v_iv bytea;
  v_note_id uuid;
  v_has_body boolean;
begin
  if not (public.auth_role() = 'ministry_admin'::public.user_role) then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_care_profile_id is null then
    raise exception 'invalid_input';
  end if;

  -- The shepherd behind this care profile must be an active leader / co_leader.
  select p.role, p.status
    into v_shepherd_role, v_shepherd_status
    from public.shepherd_care_profiles scp
    join public.profiles p on p.id = scp.shepherd_profile_id
   where scp.id = p_care_profile_id
   limit 1;
  if v_shepherd_role is null then
    raise exception 'missing_care_profile';
  end if;
  if v_shepherd_role not in ('leader'::public.user_role, 'co_leader'::public.user_role) then
    raise exception 'missing_profile';
  end if;
  if v_shepherd_status <> 'active'::public.profile_status then
    raise exception 'missing_profile';
  end if;

  if coalesce(p_set_body, false) then
    if p_ciphertext is null or p_iv is null then
      raise exception 'invalid_input';
    end if;
    v_ciphertext := decode(p_ciphertext, 'base64');
    v_iv := decode(p_iv, 'base64');
    if octet_length(v_iv) <> 12 then
      raise exception 'invalid_input';
    end if;
    -- 16 bytes = minimum (the GCM tag); 1 MiB ceiling is generous for a note.
    if octet_length(v_ciphertext) < 16 or octet_length(v_ciphertext) > 1048576 then
      raise exception 'invalid_input';
    end if;

    insert into public.shepherd_care_private_notes (
      care_profile_id, created_by_profile_id, ciphertext, iv, dek_version, updated_at
    ) values (
      p_care_profile_id, v_actor, v_ciphertext, v_iv, coalesce(p_dek_version, 1), now()
    )
    on conflict (care_profile_id, created_by_profile_id) do update
      set ciphertext = excluded.ciphertext,
          iv = excluded.iv,
          dek_version = excluded.dek_version,
          updated_at = now()
    returning id, ciphertext is not null into v_note_id, v_has_body;
  else
    -- No body change: touch only the persisted row (no creation without a body,
    -- since ciphertext is NOT NULL).
    update public.shepherd_care_private_notes
       set dek_version = coalesce(p_dek_version, dek_version),
           updated_at = now()
     where care_profile_id = p_care_profile_id
       and created_by_profile_id = v_actor
    returning id, ciphertext is not null into v_note_id, v_has_body;
    if v_note_id is null then
      raise exception 'invalid_input';
    end if;
  end if;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.shepherd_care.upsert_private_note',
    'shepherd_care_private_notes',
    v_note_id,
    jsonb_build_object(
      'care_profile_id', p_care_profile_id,
      'dek_version', coalesce(p_dek_version, 1),
      'has_body', v_has_body,
      'body_set', coalesce(p_set_body, false)
    )
  );

  return v_note_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Revoke from public/anon/authenticated, then grant execute to
-- authenticated only. Each function body still enforces the ministry_admin
-- role, so granting execute to authenticated only makes the function callable
-- while the role gate is the real boundary.
-- ---------------------------------------------------------------------------

revoke all on function public.admin_enroll_private_note_keys(smallint, jsonb) from public;
revoke all on function public.admin_enroll_private_note_keys(smallint, jsonb) from anon;
revoke all on function public.admin_enroll_private_note_keys(smallint, jsonb) from authenticated;
grant execute on function public.admin_enroll_private_note_keys(smallint, jsonb) to authenticated;

revoke all on function public.admin_upsert_shepherd_care_private_note(
  uuid, text, text, smallint, boolean
) from public;
revoke all on function public.admin_upsert_shepherd_care_private_note(
  uuid, text, text, smallint, boolean
) from anon;
revoke all on function public.admin_upsert_shepherd_care_private_note(
  uuid, text, text, smallint, boolean
) from authenticated;
grant execute on function public.admin_upsert_shepherd_care_private_note(
  uuid, text, text, smallint, boolean
) to authenticated;

-- ---------------------------------------------------------------------------
-- Function docs
-- ---------------------------------------------------------------------------

comment on function public.admin_enroll_private_note_keys(smallint, jsonb) is
  'Phase SC.4 admin write: enrolls the first private-note key slots for the calling ministry_admin (a recovery slot is mandatory), plus an audit_events row. Returns the recovery slot id. Wrapped DEK / salts / recovery code are NEVER stored in audit metadata.';

comment on function public.admin_upsert_shepherd_care_private_note(
  uuid, text, text, smallint, boolean
) is
  'Phase SC.4 admin write: upserts the AES-256-GCM ciphertext + iv for the calling ministry_admin''s private note on a care profile, plus an audit_events row. The server holds ciphertext only; audit metadata records has_body presence, never the body or key material.';
