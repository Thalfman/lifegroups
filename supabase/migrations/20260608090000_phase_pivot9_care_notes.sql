-- Pivot slice 9 (#381 / ADR 0017): author-private Care Notes + Prayer Requests
-- with the per-person transparency model.
--
-- An Over-Shepherd (already authenticated, coverage-scoped) writes Care Notes
-- and Prayer Requests ABOUT a Leader they cover. Those rows are SEALED to the
-- author by default. A per-subject transparency toggle — held in
-- note_transparency_grants, controlled by the Ministry Admin team — is the ONLY
-- thing that lets the oversight ladder peek. Julian (Super Admin) sees EXACTLY
-- what a Ministry Admin can: the SELECT policies gate Ministry Admin and Super
-- Admin on the SAME grant, with no broader super-admin bypass.
--
-- DISTINCT from the SC.4 Private Care Note (the encrypted creator-only note from
-- migration 20260529008000): that is a zero-knowledge, creator-only-EXCLUDING-
-- super_admin model. THIS slice is the inverse — a subject-toggle-gated ladder
-- peek with plaintext bodies. Separate tables, separate RLS, never merged.
--
-- The visibility truth table (mirrored purely in lib/admin/care-note-visibility.ts):
--   | Viewer                      | grant OFF | grant ON |
--   | Author (OS or Leader)       | read      | read     |
--   | Ministry Admin (not author) | sealed    | read     |
--   | Super Admin  (not author)   | sealed    | read     |  (=== Ministry Admin)
--   | Peers / other tiers         | never     | never    |
--
-- Posture (docs/adr/0002, AGENTS.md):
--   * No service-role key in the Next runtime — all writes go through the
--     SECURITY DEFINER RPCs below, called via runAdminWriteAction.
--   * No write RLS policies on care_notes / prayer_requests / note_transparency_grants:
--     direct writes are denied for every authenticated caller, so the RPCs are
--     the ONLY writers. Each derives the actor server-side, gates authorship on
--     the over-shepherd coverage predicate (auth_over_shepherd_covers), and
--     writes a paired audit_events row in the same transaction.
--   * Audit metadata is PRESENCE/LABEL ONLY: never the note or prayer body, only
--     a has_body flag — matching the admin care RPCs.
--
-- Fixed error tokens (mapped by lib/admin/action-result.ts):
--   insufficient_privilege, not_covered, invalid_input, missing_profile.

-- ---------------------------------------------------------------------------
-- 1. note_transparency_grants — per-subject Ministry-Admin peek grant.
--    One row per subject person; default DENIED. The grant gates the ladder's
--    read of BOTH care_notes and prayer_requests for that subject.
-- ---------------------------------------------------------------------------

create table if not exists public.note_transparency_grants (
  id                 uuid primary key default gen_random_uuid(),
  subject_profile_id uuid not null unique
    references public.profiles(id) on delete cascade,
  granted            boolean not null default false,
  set_by             uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

drop trigger if exists note_transparency_grants_set_updated_at
  on public.note_transparency_grants;
create trigger note_transparency_grants_set_updated_at
  before update on public.note_transparency_grants
  for each row execute function public.set_updated_at();

comment on table public.note_transparency_grants is
  'Pivot slice 9 (#381 / ADR 0017): per-subject transparency toggle. granted ON lets the oversight ladder (Ministry Admin AND Super Admin, identically) read that subject''s Care Notes + Prayer Requests; default DENIED. Writes only via set_note_transparency_grant. DISTINCT from the SC.4 private care note.';

-- ---------------------------------------------------------------------------
-- 2. care_notes — author-private care notes ABOUT a subject person.
-- ---------------------------------------------------------------------------

create table if not exists public.care_notes (
  id                 uuid primary key default gen_random_uuid(),
  author_profile_id  uuid not null references public.profiles(id) on delete restrict,
  subject_profile_id uuid not null references public.profiles(id) on delete cascade,
  body               text not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

drop trigger if exists care_notes_set_updated_at on public.care_notes;
create trigger care_notes_set_updated_at
  before update on public.care_notes
  for each row execute function public.set_updated_at();

create index if not exists care_notes_subject_idx
  on public.care_notes (subject_profile_id);
create index if not exists care_notes_author_idx
  on public.care_notes (author_profile_id);

comment on table public.care_notes is
  'Pivot slice 9 (#381 / ADR 0017): author-private care note about a subject person. Sealed to the author by default; the oversight ladder reads only when the subject has an active note_transparency_grant. Writes only via admin_write_care_note. DISTINCT from the SC.4 encrypted private care note.';

-- ---------------------------------------------------------------------------
-- 3. prayer_requests — author-private prayer requests ABOUT a subject person.
-- ---------------------------------------------------------------------------

create table if not exists public.prayer_requests (
  id                 uuid primary key default gen_random_uuid(),
  author_profile_id  uuid not null references public.profiles(id) on delete restrict,
  subject_profile_id uuid not null references public.profiles(id) on delete cascade,
  body               text not null,
  status             text not null default 'open'
    check (status in ('open','answered','archived')),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

drop trigger if exists prayer_requests_set_updated_at on public.prayer_requests;
create trigger prayer_requests_set_updated_at
  before update on public.prayer_requests
  for each row execute function public.set_updated_at();

create index if not exists prayer_requests_subject_idx
  on public.prayer_requests (subject_profile_id);
create index if not exists prayer_requests_author_idx
  on public.prayer_requests (author_profile_id);

comment on table public.prayer_requests is
  'Pivot slice 9 (#381 / ADR 0017): author-private prayer request about a subject person. Same per-person transparency gate as care_notes. Writes only via admin_write_prayer_request. DISTINCT from the SC.4 encrypted private care note.';

-- ---------------------------------------------------------------------------
-- 4. RLS — read the truth table. No write policies (RPC-only writes).
--
--    The grant gate is the SAME EXISTS subquery for care_notes and
--    prayer_requests, evaluated for both Ministry Admin AND Super Admin via
--    auth_is_admin() (which admits exactly those two roles). Super Admin gets no
--    broader bypass: the ladder reads a row only when the subject has an active
--    transparency grant. The author reads their own rows regardless of grant.
--    Peers / other tiers match neither arm, so they never read.
-- ---------------------------------------------------------------------------

alter table public.note_transparency_grants enable row level security;
alter table public.care_notes              enable row level security;
alter table public.prayer_requests         enable row level security;

-- note_transparency_grants: admin-only read (the toggle is Ministry-Admin owned;
-- auth_is_admin() admits ministry_admin + super_admin). No leader/over_shepherd
-- read of the grant table itself.
drop policy if exists note_transparency_grants_admin_select
  on public.note_transparency_grants;
create policy note_transparency_grants_admin_select
  on public.note_transparency_grants
  for select to authenticated
  using (public.auth_is_admin());

-- care_notes read: author always; OR the oversight ladder when the subject has
-- an active grant.
drop policy if exists care_notes_author_or_granted_select on public.care_notes;
create policy care_notes_author_or_granted_select
  on public.care_notes
  for select to authenticated
  using (
    author_profile_id = public.auth_profile_id()
    or (
      public.auth_is_admin()
      and exists (
        select 1
          from public.note_transparency_grants g
         where g.subject_profile_id = care_notes.subject_profile_id
           and g.granted
      )
    )
  );

-- prayer_requests read: identical gate.
drop policy if exists prayer_requests_author_or_granted_select
  on public.prayer_requests;
create policy prayer_requests_author_or_granted_select
  on public.prayer_requests
  for select to authenticated
  using (
    author_profile_id = public.auth_profile_id()
    or (
      public.auth_is_admin()
      and exists (
        select 1
          from public.note_transparency_grants g
         where g.subject_profile_id = prayer_requests.subject_profile_id
           and g.granted
      )
    )
  );

-- Table-level grants: SELECT only (RLS sits on top). No insert/update/delete
-- grants — the SECURITY DEFINER RPCs are the only writers.
revoke all    on public.note_transparency_grants from public;
revoke all    on public.note_transparency_grants from anon;
revoke all    on public.note_transparency_grants from authenticated;
grant  select on public.note_transparency_grants to authenticated;

revoke all    on public.care_notes from public;
revoke all    on public.care_notes from anon;
revoke all    on public.care_notes from authenticated;
grant  select on public.care_notes to authenticated;

revoke all    on public.prayer_requests from public;
revoke all    on public.prayer_requests from anon;
revoke all    on public.prayer_requests from authenticated;
grant  select on public.prayer_requests to authenticated;

-- ---------------------------------------------------------------------------
-- 5. admin_write_care_note — author-scoped write of a care note.
--    The actor authors the note about a subject they actively cover
--    (auth_over_shepherd_covers); the author is derived server-side, never a
--    client argument. Paired audit row records has_body only — never the body.
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

  -- Authorship boundary: the actor may only write about a person they actively
  -- cover (the over-shepherd coverage predicate, which already requires the
  -- target to be an active leader/co_leader). Any other subject is refused.
  if not public.auth_over_shepherd_covers(p_subject_profile_id) then
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

  -- Defense-in-depth: the subject must be an active leader / co_leader.
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
-- 6. admin_write_prayer_request — author-scoped write of a prayer request.
--    Same authorship boundary + content-free audit as the care-note write.
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

  if not public.auth_over_shepherd_covers(p_subject_profile_id) then
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
-- 7. set_note_transparency_grant — Ministry-Admin-controlled per-subject toggle.
--    Gated on auth_is_admin() (ministry_admin + super_admin); upserts the
--    per-subject grant and writes a paired audit row. The grant boolean is a
--    presence/label value, never a note body, so it is safe in audit metadata.
-- ---------------------------------------------------------------------------

create or replace function public.set_note_transparency_grant(
  p_subject_profile_id uuid,
  p_granted boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_target record;
  v_granted boolean;
  v_before boolean;
  v_id uuid;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_subject_profile_id is null then
    raise exception 'invalid_input';
  end if;
  -- An absent flag is an explicit "deny"; the column is NOT NULL.
  v_granted := coalesce(p_granted, false);

  -- The subject must be an active leader / co_leader — the same boundary the
  -- authorship path enforces, so a toggle can't be set on an above-ladder row.
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

  select granted into v_before
    from public.note_transparency_grants
   where subject_profile_id = p_subject_profile_id
   for update;

  insert into public.note_transparency_grants
    (subject_profile_id, granted, set_by)
  values (p_subject_profile_id, v_granted, v_actor)
  on conflict (subject_profile_id) do update
     set granted = excluded.granted,
         set_by  = v_actor
  returning id into v_id;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.note_transparency_grant.set',
    'note_transparency_grants',
    v_id,
    jsonb_build_object(
      'subject_profile_id', p_subject_profile_id,
      'before', coalesce(v_before, false),
      'after', v_granted
    )
  );

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. EXECUTE lockdown. Revoke from public/anon/authenticated, then grant to
--    authenticated only. Each function body enforces its own role/coverage gate,
--    so granting execute to authenticated only makes the function callable while
--    the in-body gate is the real boundary.
-- ---------------------------------------------------------------------------

revoke all on function public.admin_write_care_note(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_write_care_note(uuid, text) to authenticated;

revoke all on function public.admin_write_prayer_request(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_write_prayer_request(uuid, text) to authenticated;

revoke all on function public.set_note_transparency_grant(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_note_transparency_grant(uuid, boolean) to authenticated;

comment on function public.admin_write_care_note(uuid, text) is
  'Pivot slice 9 (#381) write: inserts an author-private care_notes row about a subject the actor actively covers (auth_over_shepherd_covers), plus a paired audit_events row. Note body is NEVER stored in audit metadata (has_body only).';

comment on function public.admin_write_prayer_request(uuid, text) is
  'Pivot slice 9 (#381) write: inserts an author-private prayer_requests row about a subject the actor actively covers, plus a paired audit_events row. Body is NEVER stored in audit metadata (has_body only).';

comment on function public.set_note_transparency_grant(uuid, boolean) is
  'Pivot slice 9 (#381) admin write: upserts the per-subject transparency toggle (Ministry-Admin controlled, auth_is_admin), plus a paired before/after audit row. Gates the oversight ladder''s read of that subject''s care_notes + prayer_requests.';
