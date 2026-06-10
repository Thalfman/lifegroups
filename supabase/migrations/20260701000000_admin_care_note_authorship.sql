-- Ministry-Admin authorship for Care Notes + Prayer Requests (ADR 0023,
-- amending ADR 0017 / pivot slice 9).
--
-- #381 scoped the profile-subject note writes to the over-shepherd coverage
-- predicate (auth_over_shepherd_covers), so only an Over-Shepherd covering a
-- leader could author a Care Note / Prayer Request about them. ADR 0023 widens
-- the AUTHOR set: the Ministry Admin (and Super Admin) may now author notes
-- about any active leader/co_leader, so care observations can be recorded
-- directly from the Care surface without an over-shepherd assignment.
--
-- The VISIBILITY model is untouched. The truth table from #381/#382 still
-- holds — the author always reads their own rows; the *other* admin reads a
-- sealed note only when the gating leader's note_transparency_grant is ON:
--   | Viewer                      | grant OFF | grant ON |
--   | Author (OS, Leader, Admin)  | read      | read     |
--   | Ministry Admin (not author) | sealed    | read     |
--   | Super Admin  (not author)   | sealed    | read     |  (=== Ministry Admin)
--   | Peers / other tiers         | never     | never    |
-- No RLS change is needed: the author arm (author_profile_id =
-- auth_profile_id()) is role-independent, and the ladder arm still keys on the
-- subject's grant. lib/admin/care-note-visibility.ts is unchanged.
--
-- Everything else in both functions is byte-compatible with #381: trimmed +
-- 4000-bounded body, subject must be an active leader/co_leader, paired
-- audit_events row in the same transaction with PRESENCE-ONLY metadata
-- (has_body — never the body), and the EXECUTE lockdown is restated.
--
-- Fixed error tokens (mapped by lib/admin/action-result.ts):
--   insufficient_privilege, not_covered, invalid_input, missing_profile.
--
-- Idempotent: CREATE OR REPLACE + re-stated grants. Safe to re-run.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- 1. admin_write_care_note — authorship widened to auth_is_admin() OR the
--    over-shepherd coverage predicate. The author is still derived server-side.
-- ---------------------------------------------------------------------------

create or replace function public.admin_write_care_note(
  p_subject_profile_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_target record;
  v_body text;
  v_note_id uuid;
begin
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_subject_profile_id is null then
    raise exception 'invalid_input';
  end if;

  -- Authorship boundary (ADR 0023): an admin (ministry_admin / super_admin via
  -- auth_is_admin) may write about any active leader/co_leader; an
  -- over-shepherd only about a person they actively cover. Any other caller or
  -- subject is refused with the same token as before.
  if not (
    public.auth_is_admin()
    or public.auth_over_shepherd_covers(p_subject_profile_id)
  ) then
    raise exception 'not_covered';
  end if;

  -- Body is required and bounded. Trim all leading/trailing whitespace so a body
  -- made of whitespace is rejected at the write boundary (mirrors the validator).
  v_body := nullif(regexp_replace(coalesce(p_body, ''), '^\s+|\s+$', '', 'g'), '');
  if v_body is null then
    raise exception 'invalid_input';
  end if;
  if length(v_body) > 4000 then
    raise exception 'invalid_input';
  end if;

  -- Defense-in-depth: the subject must be an active leader / co_leader. (For
  -- the coverage arm this re-checks what the predicate implies; for the new
  -- admin arm it is the only subject-tier boundary, so it stays mandatory.)
  select id, role, status into v_target
    from public.profiles
   where id = p_subject_profile_id
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

  insert into public.care_notes (author_profile_id, subject_profile_id, body)
  values (v_actor, p_subject_profile_id, v_body)
  returning id into v_note_id;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.care_note.write',
    'care_notes',
    v_note_id,
    jsonb_build_object(
      'subject_profile_id', p_subject_profile_id,
      'has_body', true
    )
  );

  return v_note_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. admin_write_prayer_request — same widened authorship boundary +
--    content-free audit as the care-note write.
-- ---------------------------------------------------------------------------

create or replace function public.admin_write_prayer_request(
  p_subject_profile_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_target record;
  v_body text;
  v_request_id uuid;
begin
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_subject_profile_id is null then
    raise exception 'invalid_input';
  end if;

  if not (
    public.auth_is_admin()
    or public.auth_over_shepherd_covers(p_subject_profile_id)
  ) then
    raise exception 'not_covered';
  end if;

  v_body := nullif(regexp_replace(coalesce(p_body, ''), '^\s+|\s+$', '', 'g'), '');
  if v_body is null then
    raise exception 'invalid_input';
  end if;
  if length(v_body) > 4000 then
    raise exception 'invalid_input';
  end if;

  select id, role, status into v_target
    from public.profiles
   where id = p_subject_profile_id
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

  insert into public.prayer_requests (author_profile_id, subject_profile_id, body)
  values (v_actor, p_subject_profile_id, v_body)
  returning id into v_request_id;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.prayer_request.write',
    'prayer_requests',
    v_request_id,
    jsonb_build_object(
      'subject_profile_id', p_subject_profile_id,
      'has_body', true
    )
  );

  return v_request_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. EXECUTE lockdown restated. The in-body admin/coverage gate is the real
--    boundary; authenticated-only execute keeps anon out entirely.
-- ---------------------------------------------------------------------------

revoke all on function public.admin_write_care_note(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_write_care_note(uuid, text) to authenticated;

revoke all on function public.admin_write_prayer_request(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_write_prayer_request(uuid, text) to authenticated;

comment on function public.admin_write_care_note(uuid, text) is
  'ADR 0023 (amending pivot slice 9 / #381) write: inserts an author-private care_notes row about an active leader/co_leader. Authorship: auth_is_admin() OR auth_over_shepherd_covers(subject). Paired audit_events row records has_body only — never the body.';

comment on function public.admin_write_prayer_request(uuid, text) is
  'ADR 0023 (amending pivot slice 9 / #381) write: inserts an author-private prayer_requests row about an active leader/co_leader. Authorship: auth_is_admin() OR auth_over_shepherd_covers(subject). Paired audit_events row records has_body only — never the body.';
