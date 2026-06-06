-- Pivot slice 11 (#382 / ADR 0017, amended by ADR 0020): the Leader care surface.
--
-- #381 built author-private Care Notes + Prayer Requests where an Over-Shepherd
-- writes ABOUT a Leader they cover (subject = a leader PROFILE). This slice opens
-- the symmetric Leader tier: a Leader (or Co-Leader) logged in behind the
-- verify-before-flip leader_surface gate writes Care Notes + Prayer Requests about
-- THEIR GROUP.
--
-- Per ADR 0020 (Julian's call, recorded with this slice) the Leader note is
-- GROUP-SCOPED, not per member: a Life Group's members are a separate non-login
-- `members` table (not profiles), and Julian keeps the roster current by his own
-- methods. So rather than thread a polymorphic member subject through the notes
-- model, a Leader's Care Note / Prayer Request is ABOUT the group as a whole
-- (subject = the GROUP). The per-member care surface from the original #382 draft
-- is intentionally NOT built.
--
-- The transparency model is unchanged from #381 and still per LEADER:
--   * An OS note about a leader is gated by THAT LEADER's transparency toggle
--     (the leader is the note's SUBJECT).
--   * A Leader's group note is gated by THAT LEADER's transparency toggle (the
--     leader is the note's AUTHOR).
--   In both cases the toggle that lets Julian peek is the LEADER's
--   note_transparency_grant — which already exists (one row per leader). No
--   per-member or per-group grant is introduced; the Care accordion has no
--   per-group toggle to hang one on.
--
-- Visibility truth table (unchanged shape; the "gating leader" differs by note
-- type), mirrored purely in lib/admin/care-note-visibility.ts:
--   | Viewer                      | grant OFF | grant ON |
--   | Author (the Leader / OS)    | read      | read     |
--   | Ministry Admin (not author) | sealed    | read     |
--   | Super Admin  (not author)   | sealed    | read     |  (=== Ministry Admin)
--   | Peers / other tiers         | never     | never    |
--
-- Posture (docs/adr/0002, AGENTS.md):
--   * No service-role key in the Next runtime — leader writes go through the new
--     SECURITY DEFINER RPCs below, called via runLeaderWriteAction.
--   * Still NO write RLS policies on care_notes / prayer_requests: the RPCs are
--     the only writers. Each derives the actor server-side, gates authorship on
--     auth_is_leader_of(group), and writes a paired audit_events row in the same
--     transaction.
--   * Audit metadata is PRESENCE/LABEL ONLY (group_id + has_body), never a body.
--
-- Fixed error tokens (mapped by lib/leader/action-result.ts):
--   insufficient_privilege, invalid_input, missing_group.
--
-- Idempotent: additive columns / indexes use IF NOT EXISTS; policies and RPCs are
-- drop-then-create / CREATE OR REPLACE. Safe to re-run.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- 1. Widen care_notes / prayer_requests to accept a GROUP subject.
--    subject_profile_id becomes nullable; a new nullable subject_group_id is
--    added; exactly one of the two must be set (XOR). Existing #381 rows have
--    subject_profile_id set and satisfy the check unchanged.
-- ---------------------------------------------------------------------------

alter table public.care_notes
  add column if not exists subject_group_id uuid references public.groups(id) on delete cascade;
alter table public.care_notes
  alter column subject_profile_id drop not null;

alter table public.prayer_requests
  add column if not exists subject_group_id uuid references public.groups(id) on delete cascade;
alter table public.prayer_requests
  alter column subject_profile_id drop not null;

-- Exactly one subject: a profile (OS note about a leader) XOR a group (leader
-- note about their group). num_nonnulls(...) = 1 forbids both-null and both-set.
alter table public.care_notes
  drop constraint if exists care_notes_one_subject;
alter table public.care_notes
  add constraint care_notes_one_subject
  check (num_nonnulls(subject_profile_id, subject_group_id) = 1);

alter table public.prayer_requests
  drop constraint if exists prayer_requests_one_subject;
alter table public.prayer_requests
  add constraint prayer_requests_one_subject
  check (num_nonnulls(subject_profile_id, subject_group_id) = 1);

create index if not exists care_notes_subject_group_idx
  on public.care_notes (subject_group_id);
create index if not exists prayer_requests_subject_group_idx
  on public.prayer_requests (subject_group_id);

comment on column public.care_notes.subject_group_id is
  'Pivot slice 11 (#382 / ADR 0020): the GROUP a leader-authored care note is about. Mutually exclusive with subject_profile_id (care_notes_one_subject). Set only by leader_write_group_care_note.';
comment on column public.prayer_requests.subject_group_id is
  'Pivot slice 11 (#382 / ADR 0020): the GROUP a leader-authored prayer request is about. Mutually exclusive with subject_profile_id (prayer_requests_one_subject). Set only by leader_write_group_prayer_request.';

-- ---------------------------------------------------------------------------
-- 2. Re-state the SELECT RLS to add the AUTHOR-grant arm for group notes.
--
--    #381's policy gated the ladder on the SUBJECT's grant (OS notes: subject =
--    leader). Group notes have no profile subject, so the ladder is gated on the
--    AUTHOR's grant (group notes: author = leader). Both arms key on the LEADER's
--    note_transparency_grant, so each note type is gated by exactly that leader's
--    toggle:
--      * OS note  -> subject_profile_id is the leader  -> subject-grant arm.
--      * Group note -> author_profile_id is the leader -> author-grant arm.
--
--    Each arm is SCOPED to its own note type by a not-null guard on the
--    discriminating subject column, so the two never cross:
--      * the subject arm only fires for profile-subject rows
--        (subject_profile_id is not null);
--      * the author arm only fires for group-subject rows
--        (subject_group_id is not null).
--    Without the author-arm's `subject_group_id is not null` guard, a stale grant
--    would leak the WRONG notes: if a leader with transparency ON is later
--    converted to over_shepherd/ministry_admin (their grant row is NOT removed by
--    super_admin_update_profile_role), the profile-subject notes they then AUTHOR
--    about some OTHER leader would match `author_profile_id`-grant and become
--    admin-readable even when that other leader's own toggle is OFF — breaking the
--    sealed-by-default guarantee. The not-null guard binds the author arm to group
--    notes only, where the author IS the gating leader.
--
--    Only leaders/co_leaders can hold a grant (set_note_transparency_grant
--    enforces that), and the XOR check guarantees exactly one of {subject, group}
--    is set per row. The author always reads their own row regardless of grant;
--    peers/other tiers match neither arm.
-- ---------------------------------------------------------------------------

drop policy if exists care_notes_author_or_granted_select on public.care_notes;
create policy care_notes_author_or_granted_select
  on public.care_notes
  for select to authenticated
  using (
    author_profile_id = public.auth_profile_id()
    or (
      public.auth_is_admin()
      and (
        (
          care_notes.subject_profile_id is not null
          and exists (
            select 1
              from public.note_transparency_grants g
             where g.subject_profile_id = care_notes.subject_profile_id
               and g.granted
          )
        )
        or (
          care_notes.subject_group_id is not null
          and exists (
            select 1
              from public.note_transparency_grants g
             where g.subject_profile_id = care_notes.author_profile_id
               and g.granted
          )
        )
      )
    )
  );

drop policy if exists prayer_requests_author_or_granted_select on public.prayer_requests;
create policy prayer_requests_author_or_granted_select
  on public.prayer_requests
  for select to authenticated
  using (
    author_profile_id = public.auth_profile_id()
    or (
      public.auth_is_admin()
      and (
        (
          prayer_requests.subject_profile_id is not null
          and exists (
            select 1
              from public.note_transparency_grants g
             where g.subject_profile_id = prayer_requests.subject_profile_id
               and g.granted
          )
        )
        or (
          prayer_requests.subject_group_id is not null
          and exists (
            select 1
              from public.note_transparency_grants g
             where g.subject_profile_id = prayer_requests.author_profile_id
               and g.granted
          )
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 3. leader_write_group_care_note — a leader's group-scoped care note.
--    Authorship boundary: the actor must be an ACTIVE leader/co_leader of the
--    target group (auth_is_leader_of), enforced in the RPC. The author is derived
--    server-side; the subject is the group. Paired audit row records the group +
--    has_body only — never the body.
-- ---------------------------------------------------------------------------

create or replace function public.leader_write_group_care_note(
  p_group_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_role public.user_role;
  v_group_id uuid;
  v_body text;
  v_note_id uuid;
begin
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;
  v_role := public.auth_role();
  if v_role is null or v_role not in ('leader'::public.user_role, 'co_leader'::public.user_role) then
    raise exception 'insufficient_privilege';
  end if;

  if p_group_id is null then
    raise exception 'invalid_input';
  end if;

  -- Authorship boundary: the actor may only write about a group they actively
  -- lead. A cross-group write is refused with insufficient_privilege (the same
  -- token the leader calendar RPCs use), never leaking the group's existence.
  if not public.auth_is_leader_of(p_group_id) then
    raise exception 'insufficient_privilege';
  end if;

  -- Body required + bounded. Trim leading/trailing whitespace so a whitespace-
  -- only body is rejected at the write boundary (mirrors the validator).
  v_body := nullif(regexp_replace(coalesce(p_body, ''), '^\s+|\s+$', '', 'g'), '');
  if v_body is null then
    raise exception 'invalid_input';
  end if;
  if length(v_body) > 4000 then
    raise exception 'invalid_input';
  end if;

  -- Defense-in-depth: the group must exist. (auth_is_leader_of already requires
  -- an active group_leaders row, so this only guards a dangling id.)
  select id into v_group_id from public.groups where id = p_group_id limit 1;
  if v_group_id is null then
    raise exception 'missing_group';
  end if;

  insert into public.care_notes (author_profile_id, subject_group_id, body)
  values (v_actor, p_group_id, v_body)
  returning id into v_note_id;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'leader.care_note.write',
    'care_notes',
    v_note_id,
    jsonb_build_object(
      'group_id', p_group_id,
      'has_body', true
    )
  );

  return v_note_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. leader_write_group_prayer_request — same authorship boundary + content-free
--    audit as the group care-note write.
-- ---------------------------------------------------------------------------

create or replace function public.leader_write_group_prayer_request(
  p_group_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_role public.user_role;
  v_group_id uuid;
  v_body text;
  v_request_id uuid;
begin
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;
  v_role := public.auth_role();
  if v_role is null or v_role not in ('leader'::public.user_role, 'co_leader'::public.user_role) then
    raise exception 'insufficient_privilege';
  end if;

  if p_group_id is null then
    raise exception 'invalid_input';
  end if;

  if not public.auth_is_leader_of(p_group_id) then
    raise exception 'insufficient_privilege';
  end if;

  v_body := nullif(regexp_replace(coalesce(p_body, ''), '^\s+|\s+$', '', 'g'), '');
  if v_body is null then
    raise exception 'invalid_input';
  end if;
  if length(v_body) > 4000 then
    raise exception 'invalid_input';
  end if;

  select id into v_group_id from public.groups where id = p_group_id limit 1;
  if v_group_id is null then
    raise exception 'missing_group';
  end if;

  insert into public.prayer_requests (author_profile_id, subject_group_id, body)
  values (v_actor, p_group_id, v_body)
  returning id into v_request_id;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'leader.prayer_request.write',
    'prayer_requests',
    v_request_id,
    jsonb_build_object(
      'group_id', p_group_id,
      'has_body', true
    )
  );

  return v_request_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. EXECUTE lockdown. Revoke from public/anon/authenticated, then grant to
--    authenticated only; the in-body leader/coverage gate is the real boundary.
-- ---------------------------------------------------------------------------

revoke all on function public.leader_write_group_care_note(uuid, text) from public, anon, authenticated;
grant execute on function public.leader_write_group_care_note(uuid, text) to authenticated;

revoke all on function public.leader_write_group_prayer_request(uuid, text) from public, anon, authenticated;
grant execute on function public.leader_write_group_prayer_request(uuid, text) to authenticated;

comment on function public.leader_write_group_care_note(uuid, text) is
  'Pivot slice 11 (#382 / ADR 0020) write: inserts an author-private care_notes row about a GROUP the actor actively leads (auth_is_leader_of), plus a paired audit_events row. Body is NEVER stored in audit metadata (group_id + has_body only).';
comment on function public.leader_write_group_prayer_request(uuid, text) is
  'Pivot slice 11 (#382 / ADR 0020) write: inserts an author-private prayer_requests row about a GROUP the actor actively leads, plus a paired audit_events row. Body is NEVER stored in audit metadata (group_id + has_body only).';
