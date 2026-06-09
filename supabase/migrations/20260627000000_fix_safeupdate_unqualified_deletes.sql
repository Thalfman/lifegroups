-- Fix: the Danger-Zone "reset" RPCs fail in production with
-- `DELETE requires a WHERE clause`.
--
-- The Supabase Data API connects as the `authenticator` role, which has
-- `session_preload_libraries = supautils, safeupdate`. The `safeupdate`
-- library rejects any UPDATE/DELETE without a WHERE clause for the whole
-- session — including statements run inside a SECURITY DEFINER function body.
-- The Clean-Slate family deliberately clears whole tables with bare
-- `delete from <table>;`, so every one of these RPCs throws when called through
-- the API (the error is not one of our domain tokens, so the action layer maps
-- it to the generic "Something went wrong saving that change" message):
--   * super_admin_clean_slate_wipe        (Clean slate)
--   * super_admin_launch_prep             (Prepare for launch; also composed by
--                                          super_admin_reset_all → Reset everything)
--   * super_admin_reset_history_category  (Reset by category)
--   * super_admin_reset_audit_logs        (Reset audit log)
--
-- CI has no Postgres and `safeupdate` is not loaded for the migration/owner
-- role, so neither the test suite nor a direct psql session reproduces it —
-- only the live API path does.
--
-- Fix: give every intentional full-table delete an explicit `where true`. That
-- satisfies safeupdate's "must have a WHERE clause" rule while still deleting
-- every row (the intended behaviour). Bodies are otherwise byte-for-byte the
-- latest definitions:
--   * super_admin_clean_slate_wipe        — 20260603160000 (table-lock revision)
--   * super_admin_launch_prep             — 20260604100000
--   * super_admin_reset_history_category  — 20260604080000
--   * super_admin_reset_audit_logs        — 20260604030000
-- Only the bare `delete from <table>;` statements changed; everything else
-- (auth gate, advisory locks, lock order, snapshot/payload capture, audit row)
-- is unchanged.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- super_admin_clean_slate_wipe() — history-only wipe (Clean slate).
-- ---------------------------------------------------------------------------
create or replace function public.super_admin_clean_slate_wipe()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_snapshot_id uuid := gen_random_uuid();
  v_payload jsonb;
  v_counts jsonb;
  v_total bigint;
  c_attendance_records bigint;
  c_attendance_sessions bigint;
  c_follow_ups bigint;
  c_guests bigint;
  c_group_health_updates bigint;
  c_group_health_assessments bigint;
  c_group_status_history bigint;
  c_church_attendance_snapshots bigint;
  c_shepherd_care_follow_ups bigint;
  c_shepherd_care_interactions bigint;
begin
  if public.auth_role() <> 'super_admin' then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  -- One Clean Slate at a time; released at transaction end.
  perform pg_advisory_xact_lock(hashtext('clean_slate'));

  -- Block concurrent history writers for the whole snapshot+delete window so the
  -- snapshot captures exactly what is deleted (no row slips in between). Parent →
  -- child order matches the writers + the restore body to avoid deadlocks.
  lock table
    public.shepherd_care_interactions,
    public.shepherd_care_follow_ups,
    public.church_attendance_snapshots,
    public.group_status_history,
    public.group_health_assessments,
    public.group_health_updates,
    public.guests,
    public.follow_ups,
    public.attendance_sessions,
    public.attendance_records
  in exclusive mode;

  select count(*) into c_attendance_records          from public.attendance_records;
  select count(*) into c_attendance_sessions         from public.attendance_sessions;
  select count(*) into c_follow_ups                  from public.follow_ups;
  select count(*) into c_guests                      from public.guests;
  select count(*) into c_group_health_updates        from public.group_health_updates;
  select count(*) into c_group_health_assessments    from public.group_health_assessments;
  select count(*) into c_group_status_history        from public.group_status_history;
  select count(*) into c_church_attendance_snapshots from public.church_attendance_snapshots;
  select count(*) into c_shepherd_care_follow_ups    from public.shepherd_care_follow_ups;
  select count(*) into c_shepherd_care_interactions  from public.shepherd_care_interactions;

  v_counts := jsonb_build_object(
    'attendance_records',          c_attendance_records,
    'attendance_sessions',         c_attendance_sessions,
    'follow_ups',                  c_follow_ups,
    'guests',                      c_guests,
    'group_health_updates',        c_group_health_updates,
    'group_health_assessments',    c_group_health_assessments,
    'group_status_history',        c_group_status_history,
    'church_attendance_snapshots', c_church_attendance_snapshots,
    'shepherd_care_follow_ups',    c_shepherd_care_follow_ups,
    'shepherd_care_interactions',  c_shepherd_care_interactions
  );

  v_total :=
    c_attendance_records + c_attendance_sessions + c_follow_ups + c_guests
    + c_group_health_updates + c_group_health_assessments + c_group_status_history
    + c_church_attendance_snapshots + c_shepherd_care_follow_ups
    + c_shepherd_care_interactions;

  if v_total = 0 then
    -- Nothing to wipe: no snapshot, no audit, no-op.
    raise exception 'nothing_to_wipe';
  end if;

  -- Explicit per-table snapshot (no dynamic loop). coalesce(..., '[]') so an
  -- empty table serializes to [] rather than null.
  v_payload := jsonb_build_object(
    'schema_version', 1,
    'attendance_records',
      coalesce((select jsonb_agg(to_jsonb(t.*)) from public.attendance_records t), '[]'::jsonb),
    'attendance_sessions',
      coalesce((select jsonb_agg(to_jsonb(t.*)) from public.attendance_sessions t), '[]'::jsonb),
    'follow_ups',
      coalesce((select jsonb_agg(to_jsonb(t.*)) from public.follow_ups t), '[]'::jsonb),
    'guests',
      coalesce((select jsonb_agg(to_jsonb(t.*)) from public.guests t), '[]'::jsonb),
    'group_health_updates',
      coalesce((select jsonb_agg(to_jsonb(t.*)) from public.group_health_updates t), '[]'::jsonb),
    'group_health_assessments',
      coalesce((select jsonb_agg(to_jsonb(t.*)) from public.group_health_assessments t), '[]'::jsonb),
    'group_status_history',
      coalesce((select jsonb_agg(to_jsonb(t.*)) from public.group_status_history t), '[]'::jsonb),
    'church_attendance_snapshots',
      coalesce((select jsonb_agg(to_jsonb(t.*)) from public.church_attendance_snapshots t), '[]'::jsonb),
    'shepherd_care_follow_ups',
      coalesce((select jsonb_agg(to_jsonb(t.*)) from public.shepherd_care_follow_ups t), '[]'::jsonb),
    'shepherd_care_interactions',
      coalesce((select jsonb_agg(to_jsonb(t.*)) from public.shepherd_care_interactions t), '[]'::jsonb)
  );

  -- A new wipe overwrites the prior snapshot — the store holds at most one.
  delete from public.clean_slate_snapshots where true;

  insert into public.clean_slate_snapshots
    (id, created_by, kind, payload, row_counts, total_rows)
  values
    (v_snapshot_id, v_actor, 'clean_slate_history', v_payload, v_counts, v_total);

  -- Delete history children → parents. attendance_records is deleted
  -- explicitly (a CASCADE from attendance_sessions would be invisible to the
  -- counts we already captured, and we want the order explicit regardless).
  -- Each carries an explicit `where true` so safeupdate (loaded for the API
  -- role) does not reject the intentional full-table delete.
  delete from public.attendance_records          where true;
  delete from public.attendance_sessions         where true;
  delete from public.follow_ups                  where true;  -- before guests (FK is ON DELETE SET NULL)
  delete from public.guests                      where true;
  delete from public.group_health_updates        where true;
  delete from public.group_health_assessments    where true;
  delete from public.group_status_history        where true;
  delete from public.church_attendance_snapshots where true;
  delete from public.shepherd_care_follow_ups    where true;
  delete from public.shepherd_care_interactions  where true;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values
    (v_actor, 'super_admin.clean_slate_wipe', 'clean_slate_snapshots', v_snapshot_id, v_counts);

  return v_snapshot_id;
end;
$$;

comment on function public.super_admin_clean_slate_wipe() is
  'PRD-SAC6 (#288): super-admin history-only wipe. Locks the history tables EXCLUSIVE (so the snapshot captures exactly what is deleted — no concurrent write slips through), captures one clean_slate_snapshots row (per-table payload + counts), then deletes the history tables children → parents (each with an explicit where true so the safeupdate API guard accepts the intentional full-table delete), with a paired super_admin.clean_slate_wipe audit row, in one transaction. Raises nothing_to_wipe when there is nothing to clear.';

-- ---------------------------------------------------------------------------
-- super_admin_launch_prep() — mute flags + history wipe + snapshot purge.
-- ---------------------------------------------------------------------------
create or replace function public.super_admin_launch_prep()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor       uuid;
  v_cfg_id      uuid;
  v_cfg         jsonb;
  v_snapshot_id uuid;
  v_purged      bigint;
begin
  if public.auth_role() <> 'super_admin' then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  -- Serialize the WHOLE launch prep on the shared 'clean_slate' key, held to
  -- transaction end. The nested wipe takes this same (re-entrant) lock, but its
  -- acquisition is rolled back together with the nothing_to_wipe subtransaction
  -- below — so taking it here is what keeps the snapshot purges serialized
  -- against a concurrent Reset-by-category revert or Clean Slate wipe even on
  -- the already-empty no-op path.
  perform pg_advisory_xact_lock(hashtext('clean_slate'));

  -- (a) Deep-merge the three launch-optics mute flags into platform_config.
  -- Mirrors super_admin_set_platform_config's feature_flags merge: read the
  -- single config row FOR UPDATE, overlay the three flag keys onto the existing
  -- feature_flags object (|| merges keys; unrelated flags survive), write back.
  select id, setting_value into v_cfg_id, v_cfg
    from public.platform_config
   where setting_key = 'platform_config'
   for update;
  if v_cfg_id is null then
    raise exception 'missing_settings';
  end if;

  update public.platform_config
     set setting_value = v_cfg || jsonb_build_object(
       'feature_flags',
       coalesce(v_cfg -> 'feature_flags', '{}'::jsonb) || jsonb_build_object(
         'mute_care_attention', jsonb_build_object('enabled', true),
         'mute_health_checks',  jsonb_build_object('enabled', true),
         'mute_follow_ups',     jsonb_build_object('enabled', true)
       )
     )
   where id = v_cfg_id;

  -- (b) Clear all accumulated history (recoverable snapshot captured first).
  -- Reuse the audited Clean Slate wipe so the delete order + snapshot logic stay
  -- in one place. nothing_to_wipe (already-clean history) is not a failure for
  -- launch prep; the sub-transaction this exception block opens rolls back only
  -- the (no-op) wipe attempt, never the mute write above.
  begin
    v_snapshot_id := public.super_admin_clean_slate_wipe();
  exception
    when others then
      if sqlerrm = 'nothing_to_wipe' then
        v_snapshot_id := null;
        -- History was already empty (a prior wipe ran), so the wipe raised
        -- BEFORE it cleared clean_slate_snapshots. Retire any stale full snapshot
        -- here too, so its Clean Slate revert can't re-inject pre-launch rows into
        -- the launch-ready database. The successful-wipe path already replaces the
        -- store with the single fresh recovery snapshot, so this is only needed on
        -- the no-op path. Serialized by the advisory lock held above.
        delete from public.clean_slate_snapshots where true;
      else
        raise;
      end if;
  end;

  -- (c) Retire every per-category history-reset snapshot so its Revert can't
  -- re-inject pre-launch rows into the clean launch database. The wipe's own
  -- snapshot (clean_slate_snapshots) is left as the single recovery point.
  delete from public.history_reset_snapshots where true;
  get diagnostics v_purged = row_count;

  -- One paired audit row summarising the whole guarded step. The reused wipe
  -- writes its own super_admin.clean_slate_wipe row when it actually cleared
  -- rows; this row records the launch-prep envelope regardless.
  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values
    (v_actor, 'super_admin.launch_prep', 'platform_config', v_cfg_id,
     jsonb_build_object(
       'muted_flags', jsonb_build_array(
         'mute_care_attention', 'mute_health_checks', 'mute_follow_ups'),
       'history_snapshot_id', v_snapshot_id,
       'purged_category_snapshots', v_purged
     ));

  return v_snapshot_id;
end;
$$;

comment on function public.super_admin_launch_prep() is
  'PRD-SAC6 follow-up: super-admin one-click launch prep. Holds the shared clean_slate advisory lock for the whole transaction, then: deep-merges the three launch-optics mute flags into platform_config, runs the Clean Slate history wipe (recoverable snapshot first; nothing_to_wipe swallowed as idempotent — and on that no-op path also retires any stale clean_slate_snapshots), purges all history_reset_snapshots so no Revert can re-inject pre-launch rows, and writes a paired super_admin.launch_prep audit row. Full-table deletes carry an explicit where true for the safeupdate API guard. Returns the wipe snapshot id, or null when history was already clear.';

-- ---------------------------------------------------------------------------
-- super_admin_reset_history_category(p_category) — Reset by category.
-- ---------------------------------------------------------------------------
create or replace function public.super_admin_reset_history_category(p_category text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_snapshot_id uuid := gen_random_uuid();
  v_payload jsonb;
  v_counts jsonb;
  v_total bigint := 0;
  c_a bigint;
  c_b bigint;
begin
  if public.auth_role() <> 'super_admin' then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  -- Reject any category not in the allow-list before touching the database.
  if p_category not in (
    'health_checks', 'follow_ups', 'attendance', 'guests',
    'church_attendance', 'shepherd_care', 'group_status_history'
  ) then
    raise exception 'invalid_category';
  end if;

  -- Shared key with the full wipe/revert: a scoped reset and a full wipe can
  -- never interleave. Released at transaction end.
  perform pg_advisory_xact_lock(hashtext('clean_slate'));

  -- Lock the category's tables EXCLUSIVE, count, and build the snapshot payload.
  -- EXCLUSIVE blocks concurrent writers but still allows plain SELECTs; the
  -- function's own counts/snapshot/deletes proceed. Held to transaction end.
  case p_category
    when 'health_checks' then
      lock table public.group_health_updates, public.group_health_assessments in exclusive mode;
      select count(*) into c_a from public.group_health_updates;
      select count(*) into c_b from public.group_health_assessments;
      v_counts := jsonb_build_object('group_health_updates', c_a, 'group_health_assessments', c_b);
      v_total := c_a + c_b;
      v_payload := jsonb_build_object(
        'schema_version', 1, 'category', p_category,
        'group_health_updates',
          coalesce((select jsonb_agg(to_jsonb(t.*)) from public.group_health_updates t), '[]'::jsonb),
        'group_health_assessments',
          coalesce((select jsonb_agg(to_jsonb(t.*)) from public.group_health_assessments t), '[]'::jsonb)
      );
    when 'follow_ups' then
      lock table public.follow_ups in exclusive mode;
      select count(*) into c_a from public.follow_ups;
      v_counts := jsonb_build_object('follow_ups', c_a);
      v_total := c_a;
      v_payload := jsonb_build_object(
        'schema_version', 1, 'category', p_category,
        'follow_ups',
          coalesce((select jsonb_agg(to_jsonb(t.*)) from public.follow_ups t), '[]'::jsonb)
      );
    when 'attendance' then
      lock table public.attendance_sessions, public.attendance_records in exclusive mode;
      select count(*) into c_a from public.attendance_records;
      select count(*) into c_b from public.attendance_sessions;
      v_counts := jsonb_build_object('attendance_records', c_a, 'attendance_sessions', c_b);
      v_total := c_a + c_b;
      v_payload := jsonb_build_object(
        'schema_version', 1, 'category', p_category,
        'attendance_records',
          coalesce((select jsonb_agg(to_jsonb(t.*)) from public.attendance_records t), '[]'::jsonb),
        'attendance_sessions',
          coalesce((select jsonb_agg(to_jsonb(t.*)) from public.attendance_sessions t), '[]'::jsonb)
      );
    when 'guests' then
      -- Lock follow_ups too: deleting guests fires the
      -- follow_ups.related_guest_id ON DELETE SET NULL FK, so capture the
      -- affected links first (under the lock) to keep the guest reset fully
      -- recoverable — the revert re-links them after restoring the guests.
      lock table public.guests, public.follow_ups in exclusive mode;
      select count(*) into c_a from public.guests;
      v_counts := jsonb_build_object('guests', c_a);
      v_total := c_a;
      v_payload := jsonb_build_object(
        'schema_version', 1, 'category', p_category,
        'guests',
          coalesce((select jsonb_agg(to_jsonb(t.*)) from public.guests t), '[]'::jsonb),
        'follow_up_guest_links',
          coalesce(
            (select jsonb_agg(jsonb_build_object('id', f.id, 'related_guest_id', f.related_guest_id))
               from public.follow_ups f where f.related_guest_id is not null),
            '[]'::jsonb
          )
      );
    when 'church_attendance' then
      lock table public.church_attendance_snapshots in exclusive mode;
      select count(*) into c_a from public.church_attendance_snapshots;
      v_counts := jsonb_build_object('church_attendance_snapshots', c_a);
      v_total := c_a;
      v_payload := jsonb_build_object(
        'schema_version', 1, 'category', p_category,
        'church_attendance_snapshots',
          coalesce((select jsonb_agg(to_jsonb(t.*)) from public.church_attendance_snapshots t), '[]'::jsonb)
      );
    when 'shepherd_care' then
      lock table public.shepherd_care_interactions, public.shepherd_care_follow_ups in exclusive mode;
      select count(*) into c_a from public.shepherd_care_follow_ups;
      select count(*) into c_b from public.shepherd_care_interactions;
      v_counts := jsonb_build_object('shepherd_care_follow_ups', c_a, 'shepherd_care_interactions', c_b);
      v_total := c_a + c_b;
      v_payload := jsonb_build_object(
        'schema_version', 1, 'category', p_category,
        'shepherd_care_follow_ups',
          coalesce((select jsonb_agg(to_jsonb(t.*)) from public.shepherd_care_follow_ups t), '[]'::jsonb),
        'shepherd_care_interactions',
          coalesce((select jsonb_agg(to_jsonb(t.*)) from public.shepherd_care_interactions t), '[]'::jsonb)
      );
    when 'group_status_history' then
      lock table public.group_status_history in exclusive mode;
      select count(*) into c_a from public.group_status_history;
      v_counts := jsonb_build_object('group_status_history', c_a);
      v_total := c_a;
      v_payload := jsonb_build_object(
        'schema_version', 1, 'category', p_category,
        'group_status_history',
          coalesce((select jsonb_agg(to_jsonb(t.*)) from public.group_status_history t), '[]'::jsonb)
      );
  end case;

  if v_total = 0 then
    -- Nothing to reset for this category: no snapshot, no audit, no-op.
    raise exception 'nothing_to_wipe';
  end if;

  -- Keep at most one un-restored snapshot per category (the recoverable one).
  delete from public.history_reset_snapshots
    where category = p_category and restored_at is null;

  insert into public.history_reset_snapshots
    (id, created_by, category, kind, payload, row_counts, total_rows)
  values
    (v_snapshot_id, v_actor, p_category, 'history_reset', v_payload, v_counts, v_total);

  -- Delete this category's tables children → parents (attendance_records before
  -- attendance_sessions is the only intra-category FK that requires order; the
  -- rest are siblings, ordered to match the full-wipe order for consistency).
  -- Each carries an explicit `where true` for the safeupdate API guard.
  case p_category
    when 'health_checks' then
      delete from public.group_health_updates     where true;
      delete from public.group_health_assessments where true;
    when 'follow_ups' then
      delete from public.follow_ups               where true;
    when 'attendance' then
      delete from public.attendance_records       where true;
      delete from public.attendance_sessions      where true;
    when 'guests' then
      delete from public.guests                   where true;
    when 'church_attendance' then
      delete from public.church_attendance_snapshots where true;
    when 'shepherd_care' then
      delete from public.shepherd_care_follow_ups   where true;
      delete from public.shepherd_care_interactions where true;
    when 'group_status_history' then
      delete from public.group_status_history     where true;
  end case;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values
    (v_actor, 'super_admin.reset_history_category', 'history_reset_snapshots', v_snapshot_id,
     v_counts || jsonb_build_object('category', p_category));

  return v_snapshot_id;
end;
$$;

comment on function public.super_admin_reset_history_category(text) is
  'PRD-SAC6 follow-up: super-admin per-category history reset. Validates the category (invalid_category), locks that category''s tables EXCLUSIVE, captures one history_reset_snapshots row, deletes the category''s tables children → parents (each with an explicit where true for the safeupdate API guard), and writes a paired super_admin.reset_history_category audit row in one transaction. Raises nothing_to_wipe when the category is already empty.';

-- ---------------------------------------------------------------------------
-- super_admin_reset_audit_logs() — archive-then-purge the audit log.
-- ---------------------------------------------------------------------------
create or replace function public.super_admin_reset_audit_logs()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_count bigint;
  v_new_id uuid := gen_random_uuid();
begin
  if public.auth_role() <> 'super_admin' then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  select count(*) into v_count from public.audit_events;

  insert into public.audit_events_archive
    (id, actor_profile_id, action, entity_type, entity_id, metadata, created_at,
     actor_name, actor_email)
  select id, actor_profile_id, action, entity_type, entity_id, metadata, created_at,
         actor_name, actor_email
  from public.audit_events;

  -- Explicit where true: purge every row, but satisfy the safeupdate API guard.
  delete from public.audit_events where true;

  insert into public.audit_events
    (id, actor_profile_id, action, entity_type, entity_id, metadata)
  values
    (v_new_id, v_actor, 'super_admin.reset_audit_logs', 'audit_events', null,
     jsonb_build_object('archived_count', v_count));

  return v_new_id;
end;
$$;

comment on function public.super_admin_reset_audit_logs() is
  'PRD-SAC6 (#290) + ADR 0014 (#314): super-admin audit-log reset. Archives current audit_events (incl. the actor descriptor) into audit_events_archive, purges (where true, for the safeupdate API guard), then writes one fresh super_admin.reset_audit_logs row carrying the prior count.';
