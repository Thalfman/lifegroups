-- Issue #880: per-dependent FK strategies so a profile that was an active
-- Leader, a covered shepherd, and a Care Note + Prayer Request author can be
-- permanently purged through super_admin_permanent_delete.
--
-- Pinned maintainer decisions (do not re-litigate):
--
--   1. Authored care_notes / prayer_requests are RETAINED with ANONYMIZED
--      authorship: author_profile_id re-points to ON DELETE SET NULL and a
--      denormalized descriptor ('Former Shepherd') is stamped in place before
--      the delete. Deliberately NO personal identifiers — unlike
--      audit_events.actor_name (SAD3), the author's name is NOT snapshotted
--      onto the note. The read path renders the descriptor only when
--      author_profile_id IS NULL.
--   2. Operational assignment records — group_leaders,
--      shepherd_coverage_assignments, shepherd_care_profiles — are cleaned up
--      pre-purge; their content is captured on the tombstone (the new
--      cleanup_snapshot column below) so the record survives even though the
--      rows do not.
--   3. Purge invariants hold: Super-Admin-only, paired audit_events row,
--      tombstone snapshot, all in the SAME transaction.
--   4. The account_deletion_requests finalize-on-purge trigger (20260704000000)
--      already wipes the request reason and completes a pending request when
--      the FK SET NULL nulls profile_id — nothing to duplicate here.
--   5. Out of scope: auth.users removal, review-queue UI, over_shepherds
--      roster rows (bridged by email, not FK-linked to profiles).
--
-- Restore coherence (super_admin_restore_tombstone, unchanged):
--   * The retained notes/prayers now fall into the collector's set-null bucket,
--     so the tombstone's set_null_dependents captures their ids and a restore
--     re-links author_profile_id automatically. The descriptor need NOT be
--     cleared on restore — the read path consults it only while
--     author_profile_id IS NULL, so a re-linked note renders its author again.
--   * cleanup_snapshot is a NEW tombstone column that restore deliberately
--     ignores: a restored profile gets its notes re-linked but its operational
--     assignment rows (group_leaders / coverage / care profile) are NOT
--     resurrected. Accepted: assignments are operational state to be re-created
--     through the normal admin flows; the tombstone keeps them for the record.
--
-- Accepted consequences (documented, deliberate):
--   * A purged leader's GROUP-scoped notes remain retained but are no longer
--     surfaceable via the RLS transparency-grant arm — that arm keys on
--     author_profile_id, which is now NULL. The notes stay sealed (author-arm
--     and grant-arm both miss). RLS policy text is intentionally UNCHANGED
--     (tests/fitness/care-note-visibility-divergence.test.ts pins it).
--   * super_admin_permanent_delete_preflight mirrors the engine's pre-step: for
--     a profile target the three operational tables are reported in a separate
--     `cleanup` bucket (not as blockers) and `deletable` is computed from the
--     remaining blockers only. One optimistic edge: a shepherd_care_profiles
--     row with restrict-linked children (interactions / follow-ups) previews as
--     cleanable, but the engine's cleanup delete still refuses safely with
--     has_blocking_dependents — the engine stays authoritative.
--
-- super_admin_confidential_block loses ONLY its author arms for profile
-- targets (a profile that merely AUTHORED notes is now purgeable — decision 1
-- retains the notes). The SC.4 private-note arm, the profile SUBJECT arms, and
-- the group SUBJECT arms are preserved verbatim: purging a note's SUBJECT would
-- still cascade-destroy sealed pastoral content the tombstone cannot recover.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- 1. care_notes / prayer_requests authorship: nullable, ON DELETE SET NULL,
--    plus the denormalized author descriptor (nullable, no default — stamped
--    only by the purge engine).
-- ---------------------------------------------------------------------------

alter table public.care_notes
  alter column author_profile_id drop not null;
alter table public.care_notes
  drop constraint if exists care_notes_author_profile_id_fkey;
alter table public.care_notes
  add constraint care_notes_author_profile_id_fkey
  foreign key (author_profile_id) references public.profiles(id)
  on delete set null;
alter table public.care_notes
  add column if not exists author_descriptor text;

comment on column public.care_notes.author_descriptor is
  'Issue #880: anonymized authorship label (''Former Shepherd'') stamped by super_admin_permanent_delete before the author profile is purged. No personal identifiers. Read only when author_profile_id is null; a tombstone restore re-links the author and this label goes dormant.';

alter table public.prayer_requests
  alter column author_profile_id drop not null;
alter table public.prayer_requests
  drop constraint if exists prayer_requests_author_profile_id_fkey;
alter table public.prayer_requests
  add constraint prayer_requests_author_profile_id_fkey
  foreign key (author_profile_id) references public.profiles(id)
  on delete set null;
alter table public.prayer_requests
  add column if not exists author_descriptor text;

comment on column public.prayer_requests.author_descriptor is
  'Issue #880: anonymized authorship label (''Former Shepherd'') stamped by super_admin_permanent_delete before the author profile is purged. No personal identifiers. Read only when author_profile_id is null; a tombstone restore re-links the author and this label goes dormant.';

-- ---------------------------------------------------------------------------
-- 2. tombstones.cleanup_snapshot — the operational rows the profile purge
--    deleted pre-flight, captured for the record. Restore ignores this column
--    on purpose (see header): [{table, column, rows:[to_jsonb(row), ...]}].
-- ---------------------------------------------------------------------------

alter table public.tombstones
  add column if not exists cleanup_snapshot jsonb not null default '[]'::jsonb;

comment on column public.tombstones.cleanup_snapshot is
  'Issue #880: full row snapshots of the operational assignment records (group_leaders, shepherd_coverage_assignments, shepherd_care_profiles) the profile purge deleted in the same transaction. Kept for the record; super_admin_restore_tombstone deliberately does NOT resurrect them.';

-- ---------------------------------------------------------------------------
-- 3. super_admin_confidential_block — drop ONLY the profile AUTHOR arms.
--    Authored notes are now retained + anonymized (decision 1), so authorship
--    alone no longer makes a profile confidential-blocked. Subject arms
--    (profile + group) and the SC.4 arm are preserved from #388 verbatim.
-- ---------------------------------------------------------------------------

create or replace function public.super_admin_confidential_block(
  p_entity_type text,
  p_id uuid
)
returns boolean
language plpgsql
stable
set search_path = public, pg_temp
as $$
begin
  if p_entity_type = 'profile' then
    return
      -- SC.4 Private Care Note (ADR 0002/0003) — unchanged from #314.
      exists (
        select 1
          from public.shepherd_care_private_notes n
          join public.shepherd_care_profiles cp on cp.id = n.care_profile_id
         where cp.shepherd_profile_id = p_id
      )
      -- #388: author-private Care Notes ABOUT this person (ADR 0017/0020).
      -- #880 removed the author-side arms: notes this person AUTHORED survive
      -- the purge with anonymized authorship instead of blocking it.
      or exists (
        select 1 from public.care_notes
         where subject_profile_id = p_id
      )
      or exists (
        select 1 from public.prayer_requests
         where subject_profile_id = p_id
      );
  end if;

  if p_entity_type = 'group' then
    -- #388: a leader's author-private group notes (ADR 0020).
    return
      exists (select 1 from public.care_notes where subject_group_id = p_id)
      or exists (
        select 1 from public.prayer_requests where subject_group_id = p_id
      );
  end if;

  return false;
end;
$$;

revoke all on function public.super_admin_confidential_block(text, uuid) from public;
revoke all on function public.super_admin_confidential_block(text, uuid) from anon;
revoke all on function public.super_admin_confidential_block(text, uuid) from authenticated;

comment on function public.super_admin_confidential_block(text, uuid) is
  'ADR 0014 (#313/#314/#388) + #880: opaque permanent-blocker hook. True when the target holds sealed pastoral content it is the SUBJECT of — SC.4 private care notes, author-private Care Notes / Prayer Requests about the profile, or about the group. Authorship alone no longer blocks a profile (#880: authored notes are retained anonymized). Reported opaquely — no count/table/key metadata. Internal helper.';

-- ---------------------------------------------------------------------------
-- 4. super_admin_permanent_delete — same engine as SAD3, plus the #880
--    profile-specific pre-step, placed AFTER the target-row snapshot and
--    BEFORE super_admin_collect_dependents:
--      a. stamp the anonymized author descriptor on retained notes/prayers;
--      b. capture-then-delete the operational assignment rows (group_leaders,
--         shepherd_coverage_assignments, shepherd_care_profiles) so they never
--         reach the collector as cascade/restrict blockers.
--    Everything else — role gate, allowlist, super_admin forbidden-target
--    guard, opaque confidential block, blocker refusal, tombstone + paired
--    audit row + delete in one transaction — is unchanged.
-- ---------------------------------------------------------------------------

create or replace function public.super_admin_permanent_delete(
  p_entity_type text,
  p_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_table text;
  v_row jsonb;
  v_deps jsonb;
  v_blockers jsonb;
  v_cleanup jsonb := '[]'::jsonb;
  v_rows jsonb;
  v_metadata jsonb;
  v_notes_anonymized bigint := 0;
  v_prayers_anonymized bigint := 0;
  v_group_leaders_cleaned bigint := 0;
  v_coverage_cleaned bigint := 0;
  v_care_profiles_cleaned bigint := 0;
  v_tombstone_id uuid := gen_random_uuid();
begin
  if public.auth_role() <> 'super_admin' then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_id is null then
    raise exception 'invalid_input';
  end if;

  v_table := public.super_admin_deletable_table(p_entity_type);
  if v_table is null then
    raise exception 'forbidden_target';
  end if;

  -- Forbid ANY super_admin profile target (not just self / bootstrap), matching
  -- the super_admin_set_profile_status forbidden_target guard. Permanent
  -- deletion is strictly more destructive than disable, so the role-boundary
  -- guard must be at least as wide.
  if p_entity_type = 'profile' then
    if exists (
      select 1 from public.profiles
       where id = p_id and role = 'super_admin'
    ) then
      raise exception 'forbidden_target';
    end if;
  end if;

  -- Opaque permanent block: confidential records (SC.4 + subject-side sealed
  -- notes) can never be deleted.
  if public.super_admin_confidential_block(p_entity_type, p_id) then
    raise exception 'has_confidential_records';
  end if;

  execute format('select to_jsonb(t) from public.%I t where t.id = $1', v_table)
    into v_row
    using p_id;
  if v_row is null then
    raise exception 'missing_entity';
  end if;

  -- #880 pre-step, profile targets only. Runs AFTER the target snapshot and
  -- BEFORE the dependent collector, all in this one transaction (a later
  -- blocker refusal rolls every bit of it back).
  if p_entity_type = 'profile' then
    -- a. Anonymize retained authorship. The FK SET NULL fires at the delete
    --    below; this stamp is the label the read path shows once it has.
    --    NO personal identifiers — deliberately not the author's name.
    update public.care_notes
       set author_descriptor = 'Former Shepherd'
     where author_profile_id = p_id;
    get diagnostics v_notes_anonymized = row_count;

    update public.prayer_requests
       set author_descriptor = 'Former Shepherd'
     where author_profile_id = p_id;
    get diagnostics v_prayers_anonymized = row_count;

    -- b. Capture-then-delete the operational assignment records so their
    --    cascade/restrict FKs never reach the collector as blockers. The
    --    snapshots land on the tombstone (cleanup_snapshot); restore does NOT
    --    resurrect them (see the migration header).
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
      into v_rows
      from public.group_leaders t
     where t.profile_id = p_id;
    if jsonb_array_length(v_rows) > 0 then
      v_cleanup := v_cleanup || jsonb_build_object(
        'table', 'group_leaders',
        'column', 'profile_id',
        'rows', v_rows
      );
    end if;

    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
      into v_rows
      from public.shepherd_coverage_assignments t
     where t.shepherd_profile_id = p_id;
    if jsonb_array_length(v_rows) > 0 then
      v_cleanup := v_cleanup || jsonb_build_object(
        'table', 'shepherd_coverage_assignments',
        'column', 'shepherd_profile_id',
        'rows', v_rows
      );
    end if;

    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
      into v_rows
      from public.shepherd_care_profiles t
     where t.shepherd_profile_id = p_id;
    if jsonb_array_length(v_rows) > 0 then
      v_cleanup := v_cleanup || jsonb_build_object(
        'table', 'shepherd_care_profiles',
        'column', 'shepherd_profile_id',
        'rows', v_rows
      );
    end if;

    -- A care profile with restrict-linked children (interactions, follow-ups)
    -- still refuses the purge — map the FK violation to the engine's existing
    -- blocker token so callers see the same vocabulary either way.
    begin
      delete from public.group_leaders
       where profile_id = p_id;
      get diagnostics v_group_leaders_cleaned = row_count;

      delete from public.shepherd_coverage_assignments
       where shepherd_profile_id = p_id;
      get diagnostics v_coverage_cleaned = row_count;

      delete from public.shepherd_care_profiles
       where shepherd_profile_id = p_id;
      get diagnostics v_care_profiles_cleaned = row_count;
    exception
      when foreign_key_violation then
        raise exception 'has_blocking_dependents';
    end;
  end if;

  v_deps := public.super_admin_collect_dependents(v_table, p_id);
  v_blockers := v_deps->'blockers';
  if jsonb_array_length(v_blockers) > 0 then
    raise exception 'has_blocking_dependents';
  end if;

  insert into public.tombstones
    (id, entity_type, table_name, entity_id, row_snapshot, set_null_dependents,
     cleanup_snapshot, deleted_by)
  values
    (v_tombstone_id, p_entity_type, v_table, p_id, v_row, v_deps->'set_null',
     v_cleanup, v_actor);

  -- Paired audit row, same transaction. Content-free: counts only — never a
  -- note body, never a name.
  v_metadata := jsonb_build_object(
    'entity_type', p_entity_type,
    'tombstone_id', v_tombstone_id
  );
  if p_entity_type = 'profile' then
    v_metadata := v_metadata || jsonb_build_object(
      'anonymized_care_note_count', v_notes_anonymized,
      'anonymized_prayer_request_count', v_prayers_anonymized,
      'cleaned_group_leader_count', v_group_leaders_cleaned,
      'cleaned_coverage_assignment_count', v_coverage_cleaned,
      'cleaned_care_profile_count', v_care_profiles_cleaned
    );
  end if;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'super_admin.permanent_delete',
    v_table,
    p_id,
    v_metadata
  );

  execute format('delete from public.%I where id = $1', v_table) using p_id;

  return v_tombstone_id;
end;
$$;

revoke all     on function public.super_admin_permanent_delete(text, uuid) from public;
revoke all     on function public.super_admin_permanent_delete(text, uuid) from anon;
revoke all     on function public.super_admin_permanent_delete(text, uuid) from authenticated;
grant  execute on function public.super_admin_permanent_delete(text, uuid) to authenticated;

comment on function public.super_admin_permanent_delete(text, uuid) is
  'ADR 0014 (#312–#314) + #880: super-admin curated permanent deletion. For a profile target it first anonymizes retained authored Care Notes / Prayer Requests (author_descriptor, FK now ON DELETE SET NULL) and capture-then-deletes the operational assignment rows onto the tombstone''s cleanup_snapshot — then the unchanged spine: forbidden/confidential/blocker guards, tombstone + paired audit row + delete in one transaction. auth.users is never touched.';

-- ---------------------------------------------------------------------------
-- 5. super_admin_permanent_delete_preflight — mirror the engine's profile
--    pre-step so the danger-zone report matches what the delete will actually
--    do. For a profile target, the three operational tables the engine cleans
--    up in-transaction are moved out of `blockers` into a separate `cleanup`
--    bucket ({table, column, count} — the set_null display shape), and
--    `deletable` is computed from the REMAINING blockers only. Every existing
--    response key (deletable / forbidden / confidential / blockers / set_null)
--    keeps its meaning; `cleanup` is additive (always present, [] for
--    non-profile targets). Optimistic edge (see the header): a care profile
--    with restrict-linked children previews as cleanup, but the engine's
--    cleanup delete still refuses with has_blocking_dependents.
-- ---------------------------------------------------------------------------

create or replace function public.super_admin_permanent_delete_preflight(
  p_entity_type text,
  p_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_table text;
  v_deps jsonb;
  v_remaining jsonb := '[]'::jsonb;
  v_cleanup jsonb := '[]'::jsonb;
  v_set_null jsonb := '[]'::jsonb;
  r jsonb;
begin
  if public.auth_role() <> 'super_admin' then
    raise exception 'insufficient_privilege';
  end if;

  v_table := public.super_admin_deletable_table(p_entity_type);
  if v_table is null then
    return jsonb_build_object('deletable', false, 'forbidden', true);
  end if;

  if p_entity_type = 'profile'
     and exists (select 1 from public.profiles where id = p_id and role = 'super_admin')
  then
    return jsonb_build_object('deletable', false, 'forbidden', true);
  end if;

  if public.super_admin_confidential_block(p_entity_type, p_id) then
    return jsonb_build_object('deletable', false, 'confidential', true);
  end if;

  v_deps := public.super_admin_collect_dependents(v_table, p_id);

  -- #880: for a profile target, the engine capture-then-deletes these three
  -- operational tables before the collector runs — so their inbound FKs are
  -- not blockers, they are announced cleanup. Everything else stays a blocker.
  for r in select * from jsonb_array_elements(v_deps->'blockers')
  loop
    if p_entity_type = 'profile'
       and (
         (r->>'table' = 'group_leaders'
          and r->>'column' = 'profile_id')
         or (r->>'table' = 'shepherd_coverage_assignments'
             and r->>'column' = 'shepherd_profile_id')
         or (r->>'table' = 'shepherd_care_profiles'
             and r->>'column' = 'shepherd_profile_id')
       )
    then
      v_cleanup := v_cleanup || jsonb_build_object(
        'table', r->>'table',
        'column', r->>'column',
        'count', r->'count'
      );
    else
      v_remaining := v_remaining || r;
    end if;
  end loop;

  for r in select * from jsonb_array_elements(v_deps->'set_null')
  loop
    v_set_null := v_set_null || jsonb_build_object(
      'table', r->>'table',
      'column', r->>'column',
      'count', r->'count'
    );
  end loop;

  return jsonb_build_object(
    'deletable', jsonb_array_length(v_remaining) = 0,
    'forbidden', false,
    'confidential', false,
    'blockers', v_remaining,
    'cleanup', v_cleanup,
    'set_null', v_set_null
  );
end;
$$;

revoke all     on function public.super_admin_permanent_delete_preflight(text, uuid) from public;
revoke all     on function public.super_admin_permanent_delete_preflight(text, uuid) from anon;
revoke all     on function public.super_admin_permanent_delete_preflight(text, uuid) from authenticated;
grant  execute on function public.super_admin_permanent_delete_preflight(text, uuid) to authenticated;

comment on function public.super_admin_permanent_delete_preflight(text, uuid) is
  'ADR 0014 (#313/#314) + #880: super-admin permanent-deletion preflight. Reports forbidden targets (incl. super_admin profiles), the opaque confidential block, the named blockers + set-null preview, and — for profile targets — the operational assignment rows the engine will clean up in-transaction (cleanup bucket, excluded from blockers/deletable).';
