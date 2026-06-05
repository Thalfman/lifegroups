-- health-checks-reset: true reset of the two duration-derived "Needs attention"
-- cards (overdue/missing health checks, leaders needing care).
--
-- The Clean Slate wipe (#288) and per-category reset only DELETE history rows;
-- they keep shepherd_care_profiles, so the fields that actually drive "needs
-- care" (last_contact_at, next_touchpoint_due, current_status) survive every
-- reset and the card never clears. Health "missing" is the ABSENCE of a weekly
-- submission for a due week — there is no row to delete, and wiping attendance
-- makes EVERY scheduled group read missing. So the only thing that ever cleared
-- those cards was the mute feature flag — a hide, not a reset.
--
-- This adds the honest mechanism: an "as-of" reset baseline the pure
-- derivations measure from. Anything at/before the baseline reads as "not
-- behind", so a reset drops the card to zero WITHOUT muting and WITHOUT deleting
-- history, and the clock restarts so real work re-surfaces naturally later.
-- Stored per surface ('care' | 'health'), either as a single global row or a
-- per-entity override (a shepherd profile id for care, a group id for health).
--
-- Two tables: attention_reset_baselines (read by the dashboard, admin-readable)
-- and attention_reset_snapshots (recoverable undo, super-admin-only). The
-- snapshot store is kept INDEPENDENT of clean_slate_snapshots /
-- history_reset_snapshots — and on a DISTINCT advisory key ('attention_reset')
-- since these resets touch neither the history tables nor those stores — so a
-- Clean Slate wipe never blows it away and the two never needlessly contend.
--
-- Three SECURITY DEFINER RPCs, all super-admin gated (bulk AND per-entity):
--   super_admin_reset_care_attention(scope, entity_id)
--   super_admin_reset_health_attention(scope, entity_id)
--   super_admin_reset_attention_revert(snapshot_id)
-- Unlike the history resets there is NO nothing_to_wipe guard: the baseline is
-- the point even when no rows change (the cards are time-derived, not row-count
-- derived). The care reset additionally wipes each targeted profile to a clean
-- slate (status -> doing_well, next_touchpoint_due -> null) but deliberately
-- NEVER nulls last_contact_at — that would re-arm no_contact_yet and lose real
-- history; the baseline is the contact floor instead. The health baseline clears
-- the absence-derived "missing" half; the reset ALSO field-wipes the
-- "needs_follow_up" half (groups.health_status, the per-group manual override,
-- and the latest pulse follow_up_needed flag) so the whole card reads clear.
-- Every field-wipe is snapshotted first and restored on revert.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- attention_reset_baselines: the "as-of" reset dates the derivations honour.
-- Admin-readable SELECT (the whole admin team's Home agrees); no write policy
-- (all writes flow through the SECURITY DEFINER RPCs below).
-- ---------------------------------------------------------------------------
create table if not exists public.attention_reset_baselines (
  id uuid primary key default gen_random_uuid(),
  surface text not null check (surface in ('care', 'health')),
  scope text not null check (scope in ('global', 'entity')),
  -- shepherd profile id (care) or group id (health); null for scope='global'.
  entity_id uuid,
  -- the as-of date the derivation measures from (week-start is derived in TS
  -- for health so the dashboard's selected-week compare stays a string compare).
  baseline_on date not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  -- A global row carries no entity; an entity row must name one.
  constraint attention_reset_baselines_scope_entity_ck check (
    (scope = 'global' and entity_id is null) or
    (scope = 'entity' and entity_id is not null)
  )
);

-- At most one global baseline per surface, and one override per (surface, entity).
create unique index if not exists uq_attention_reset_baselines_global
  on public.attention_reset_baselines (surface)
  where scope = 'global';
create unique index if not exists uq_attention_reset_baselines_entity
  on public.attention_reset_baselines (surface, entity_id)
  where scope = 'entity';

alter table public.attention_reset_baselines enable row level security;

-- Admin-readable (auth_is_admin admits ministry_admin AND super_admin) so the
-- dashboard read honours the baseline for the whole admin team. No write policy:
-- the RPCs are SECURITY DEFINER and bypass RLS.
create policy attention_reset_baselines_admin_read
  on public.attention_reset_baselines
  for select to authenticated using (public.auth_is_admin());

revoke all    on public.attention_reset_baselines from public;
revoke all    on public.attention_reset_baselines from anon;
revoke all    on public.attention_reset_baselines from authenticated;
grant  select on public.attention_reset_baselines to authenticated;

-- ---------------------------------------------------------------------------
-- attention_reset_snapshots: recoverable undo for a reset. Super-admin-only
-- SELECT (mirrors clean_slate_snapshots / audit_events). payload holds the
-- prior baseline rows and (for care) the prior shepherd_care_profiles field
-- values the reset overwrote, so a revert restores both.
-- ---------------------------------------------------------------------------
create table if not exists public.attention_reset_snapshots (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  surface text not null check (surface in ('care', 'health')),
  scope text not null check (scope in ('global', 'entity')),
  entity_id uuid,
  kind text not null,
  payload jsonb not null,
  row_counts jsonb not null default '{}'::jsonb,
  total_rows bigint not null default 0,
  restored_at timestamptz,
  restored_by uuid references public.profiles(id)
);

create index if not exists idx_attention_reset_snapshots_surface_created_at
  on public.attention_reset_snapshots (surface, created_at desc);

alter table public.attention_reset_snapshots enable row level security;

create policy attention_reset_snapshots_super_admin_read
  on public.attention_reset_snapshots
  for select to authenticated using (public.auth_role() = 'super_admin');

revoke all    on public.attention_reset_snapshots from public;
revoke all    on public.attention_reset_snapshots from anon;
revoke all    on public.attention_reset_snapshots from authenticated;
grant  select on public.attention_reset_snapshots to authenticated;

-- ---------------------------------------------------------------------------
-- super_admin_reset_care_attention(p_scope, p_entity_id)
-- ---------------------------------------------------------------------------
create or replace function public.super_admin_reset_care_attention(
  p_scope text,
  p_entity_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_snapshot_id uuid := gen_random_uuid();
  v_baseline_payload jsonb;
  v_profile_payload jsonb;
  v_affected bigint := 0;
  v_today date := current_date;
begin
  if public.auth_role() <> 'super_admin' then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  -- Validate scope/entity pairing before touching anything.
  if p_scope not in ('global', 'entity') then
    raise exception 'invalid_input';
  end if;
  if p_scope = 'entity' and p_entity_id is null then
    raise exception 'invalid_input';
  end if;
  if p_scope = 'global' and p_entity_id is not null then
    raise exception 'invalid_input';
  end if;

  -- Distinct from the clean_slate key: these resets touch neither the history
  -- tables nor the clean-slate / history-reset snapshot stores, so they need
  -- not serialize against a full wipe. Held to transaction end.
  perform pg_advisory_xact_lock(hashtext('attention_reset'));

  -- Capture (read-only) the prior baseline row(s) we are about to replace and
  -- the prior care-row field values we are about to overwrite, BEFORE mutating.
  v_baseline_payload := coalesce((
    select jsonb_agg(to_jsonb(t.*))
      from public.attention_reset_baselines t
     where t.surface = 'care'
       and t.scope = p_scope
       and (t.entity_id is not distinct from p_entity_id)
  ), '[]'::jsonb);

  v_profile_payload := coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id,
             'current_status', p.current_status,
             'next_touchpoint_due', p.next_touchpoint_due
           ))
      from public.shepherd_care_profiles p
     where (p_scope = 'global' and p.archived_at is null)
        or (p_scope = 'entity' and p.shepherd_profile_id = p_entity_id)
  ), '[]'::jsonb);

  -- The clean-slate field-wipe touches only rows not already at the default, so
  -- the count + snapshot reflect exactly what changes. Counted before the
  -- update so the snapshot is INSERTed before any mutation.
  select count(*) into v_affected
    from public.shepherd_care_profiles p
   where (
           (p_scope = 'global' and p.archived_at is null)
        or (p_scope = 'entity' and p.shepherd_profile_id = p_entity_id)
         )
     and (p.current_status <> 'doing_well' or p.next_touchpoint_due is not null);

  -- Keep at most one un-restored snapshot per surface/scope/entity.
  delete from public.attention_reset_snapshots
   where surface = 'care'
     and scope = p_scope
     and (entity_id is not distinct from p_entity_id)
     and restored_at is null;

  insert into public.attention_reset_snapshots
    (id, created_by, surface, scope, entity_id, kind, payload, row_counts, total_rows)
  values
    (v_snapshot_id, v_actor, 'care', p_scope, p_entity_id, 'attention_reset',
     jsonb_build_object(
       'schema_version', 1,
       'surface', 'care',
       'prior_baselines', v_baseline_payload,
       'prior_care_profiles', v_profile_payload
     ),
     jsonb_build_object('care_profiles_reset', v_affected),
     v_affected);

  -- Replace the baseline (one per surface/scope/entity) at today's date.
  delete from public.attention_reset_baselines
   where surface = 'care'
     and scope = p_scope
     and (entity_id is not distinct from p_entity_id);
  insert into public.attention_reset_baselines
    (surface, scope, entity_id, baseline_on, created_by)
  values
    ('care', p_scope, p_entity_id, v_today, v_actor);

  -- Clean-slate field-wipe: clear the admin-set signals the baseline can't mask
  -- (concern/needs_follow_up status, scheduled touchpoint). last_contact_at is
  -- deliberately preserved — the baseline is the contact floor.
  update public.shepherd_care_profiles p
     set current_status = 'doing_well',
         next_touchpoint_due = null,
         updated_at = now()
   where (
           (p_scope = 'global' and p.archived_at is null)
        or (p_scope = 'entity' and p.shepherd_profile_id = p_entity_id)
         )
     and (p.current_status <> 'doing_well' or p.next_touchpoint_due is not null);

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values
    (v_actor, 'super_admin.reset_care_attention', 'attention_reset_snapshots', v_snapshot_id,
     jsonb_build_object(
       'surface', 'care', 'scope', p_scope, 'entity_id', p_entity_id,
       'care_profiles_reset', v_affected
     ));

  return v_snapshot_id;
end;
$$;

revoke all     on function public.super_admin_reset_care_attention(text, uuid) from public;
revoke all     on function public.super_admin_reset_care_attention(text, uuid) from anon;
revoke all     on function public.super_admin_reset_care_attention(text, uuid) from authenticated;
grant  execute on function public.super_admin_reset_care_attention(text, uuid) to authenticated;

comment on function public.super_admin_reset_care_attention(text, uuid) is
  'health-checks-reset: super-admin reset of the leader-care "Needs attention" card. Sets a care reset baseline (global or per-leader) at today, snapshots the prior baseline + care field values first, then clean-slate field-wipes the targeted shepherd_care_profiles (status -> doing_well, next_touchpoint_due -> null) WITHOUT nulling last_contact_at. Writes a paired super_admin.reset_care_attention audit row. No nothing_to_wipe guard — the baseline is the point.';

-- ---------------------------------------------------------------------------
-- super_admin_reset_health_attention(p_scope, p_entity_id)
-- ---------------------------------------------------------------------------
create or replace function public.super_admin_reset_health_attention(
  p_scope text,
  p_entity_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_snapshot_id uuid := gen_random_uuid();
  v_baseline_payload jsonb;
  v_status_payload jsonb;
  v_override_payload jsonb;
  v_pulse_payload jsonb;
  v_today date := current_date;
  c_status bigint;
  c_override bigint;
  c_pulse bigint;
begin
  if public.auth_role() <> 'super_admin' then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_scope not in ('global', 'entity') then
    raise exception 'invalid_input';
  end if;
  if p_scope = 'entity' and p_entity_id is null then
    raise exception 'invalid_input';
  end if;
  if p_scope = 'global' and p_entity_id is not null then
    raise exception 'invalid_input';
  end if;

  perform pg_advisory_xact_lock(hashtext('attention_reset'));

  v_baseline_payload := coalesce((
    select jsonb_agg(to_jsonb(t.*))
      from public.attention_reset_baselines t
     where t.surface = 'health'
       and t.scope = p_scope
       and (t.entity_id is not distinct from p_entity_id)
  ), '[]'::jsonb);

  -- Capture (read-only, BEFORE mutating) the three sources of the absence-
  -- INDEPENDENT "needs_follow_up" half of the card so a clean-slate reset clears
  -- it too: the group's admin-set health_status, the per-group manual override,
  -- and the latest pulse's follow-up flag. (The "missing" half is governed by the
  -- baseline, not by rows.) Global targets every non-closed group — exactly the
  -- set buildHealthSummary partitions.
  v_status_payload := coalesce((
    select jsonb_agg(jsonb_build_object('id', g.id, 'health_status', g.health_status))
      from public.groups g
     where g.health_status = 'needs_follow_up'
       and (
             (p_scope = 'global' and g.lifecycle_status <> 'closed')
          or (p_scope = 'entity' and g.id = p_entity_id)
           )
  ), '[]'::jsonb);

  v_override_payload := coalesce((
    select jsonb_agg(jsonb_build_object(
             'group_id', s.group_id,
             'manual_health_status_override', s.manual_health_status_override
           ))
      from public.group_metric_settings s
     where s.manual_health_status_override = 'needs_follow_up'
       and (
             (p_scope = 'global' and s.group_id in (
                select id from public.groups where lifecycle_status <> 'closed'))
          or (p_scope = 'entity' and s.group_id = p_entity_id)
           )
  ), '[]'::jsonb);

  v_pulse_payload := coalesce((
    select jsonb_agg(jsonb_build_object('id', u.id))
      from public.group_health_updates u
     where u.follow_up_needed = true
       and (
             (p_scope = 'global' and u.group_id in (
                select id from public.groups where lifecycle_status <> 'closed'))
          or (p_scope = 'entity' and u.group_id = p_entity_id)
           )
  ), '[]'::jsonb);

  c_status := jsonb_array_length(v_status_payload);
  c_override := jsonb_array_length(v_override_payload);
  c_pulse := jsonb_array_length(v_pulse_payload);

  delete from public.attention_reset_snapshots
   where surface = 'health'
     and scope = p_scope
     and (entity_id is not distinct from p_entity_id)
     and restored_at is null;

  -- Snapshot INSERTed before any mutation, so the prior values are recoverable.
  insert into public.attention_reset_snapshots
    (id, created_by, surface, scope, entity_id, kind, payload, row_counts, total_rows)
  values
    (v_snapshot_id, v_actor, 'health', p_scope, p_entity_id, 'attention_reset',
     jsonb_build_object(
       'schema_version', 1,
       'surface', 'health',
       'prior_baselines', v_baseline_payload,
       'prior_group_health_status', v_status_payload,
       'prior_metric_overrides', v_override_payload,
       'prior_pulse_flags', v_pulse_payload
     ),
     jsonb_build_object(
       'health_status', c_status,
       'metric_overrides', c_override,
       'pulse_flags', c_pulse
     ),
     c_status + c_override + c_pulse);

  -- Replace the baseline at today (governs the absence-derived "missing" half).
  delete from public.attention_reset_baselines
   where surface = 'health'
     and scope = p_scope
     and (entity_id is not distinct from p_entity_id);
  insert into public.attention_reset_baselines
    (surface, scope, entity_id, baseline_on, created_by)
  values
    ('health', p_scope, p_entity_id, v_today, v_actor);

  -- Clean-slate field-wipe of the "needs_follow_up" half: clear the admin-set
  -- health_status, the per-group manual override, and the latest pulse flag, so
  -- the card reads fully clear (not just its absence-derived half).
  update public.groups g
     set health_status = 'healthy',
         updated_at = now()
   where g.health_status = 'needs_follow_up'
     and (
           (p_scope = 'global' and g.lifecycle_status <> 'closed')
        or (p_scope = 'entity' and g.id = p_entity_id)
         );

  update public.group_metric_settings s
     set manual_health_status_override = null
   where s.manual_health_status_override = 'needs_follow_up'
     and (
           (p_scope = 'global' and s.group_id in (
              select id from public.groups where lifecycle_status <> 'closed'))
        or (p_scope = 'entity' and s.group_id = p_entity_id)
         );

  update public.group_health_updates u
     set follow_up_needed = false
   where u.follow_up_needed = true
     and (
           (p_scope = 'global' and u.group_id in (
              select id from public.groups where lifecycle_status <> 'closed'))
        or (p_scope = 'entity' and u.group_id = p_entity_id)
         );

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values
    (v_actor, 'super_admin.reset_health_attention', 'attention_reset_snapshots', v_snapshot_id,
     jsonb_build_object(
       'surface', 'health', 'scope', p_scope, 'entity_id', p_entity_id,
       'health_status', c_status, 'metric_overrides', c_override, 'pulse_flags', c_pulse
     ));

  return v_snapshot_id;
end;
$$;

revoke all     on function public.super_admin_reset_health_attention(text, uuid) from public;
revoke all     on function public.super_admin_reset_health_attention(text, uuid) from anon;
revoke all     on function public.super_admin_reset_health_attention(text, uuid) from authenticated;
grant  execute on function public.super_admin_reset_health_attention(text, uuid) to authenticated;

comment on function public.super_admin_reset_health_attention(text, uuid) is
  'health-checks-reset: super-admin reset of the health-check "Needs attention" card. Sets a health reset baseline (global or per-group) at today (governs the absence-derived "missing" half) and, snapshotting prior values first, clean-slate field-wipes the "needs_follow_up" half: clears groups.health_status=needs_follow_up -> healthy, the per-group manual override, and the latest pulse follow_up_needed flag. Writes a paired super_admin.reset_health_attention audit row.';

-- ---------------------------------------------------------------------------
-- super_admin_reset_attention_revert(p_snapshot_id)
-- ---------------------------------------------------------------------------
create or replace function public.super_admin_reset_attention_revert(
  p_snapshot_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_snapshot public.attention_reset_snapshots;
  v_surface text;
  v_scope text;
  v_entity uuid;
  v_payload jsonb;
begin
  if public.auth_role() <> 'super_admin' then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  perform pg_advisory_xact_lock(hashtext('attention_reset'));

  select * into v_snapshot
    from public.attention_reset_snapshots
   where id = p_snapshot_id
   for update;

  if v_snapshot.id is null then
    raise exception 'missing_snapshot';
  end if;

  -- A second revert of the same snapshot is a no-op (idempotent via restored_at).
  if v_snapshot.restored_at is not null then
    return v_snapshot.id;
  end if;

  v_surface := v_snapshot.surface;
  v_scope := v_snapshot.scope;
  v_entity := v_snapshot.entity_id;
  v_payload := v_snapshot.payload;

  -- Restore the baseline: drop the current one for this surface/scope/entity and
  -- re-insert the prior row(s) the reset replaced (none when the reset was the
  -- first baseline — the delete alone returns to "no baseline").
  delete from public.attention_reset_baselines
   where surface = v_surface
     and scope = v_scope
     and (entity_id is not distinct from v_entity);
  insert into public.attention_reset_baselines
    select * from jsonb_populate_recordset(
      null::public.attention_reset_baselines,
      coalesce(v_payload -> 'prior_baselines', '[]'::jsonb)
    );

  -- For care, restore the snapshotted profile field values the field-wipe
  -- overwrote. Only rows that still exist are updated; deleted profiles are
  -- silently skipped.
  if v_surface = 'care' then
    update public.shepherd_care_profiles p
       set current_status = (x.current_status)::public.shepherd_care_status,
           next_touchpoint_due = x.next_touchpoint_due,
           updated_at = now()
      from jsonb_to_recordset(
             coalesce(v_payload -> 'prior_care_profiles', '[]'::jsonb)
           ) as x(id uuid, current_status text, next_touchpoint_due date)
     where p.id = x.id;
  -- For health, restore the three "needs_follow_up" sources the field-wipe
  -- cleared. Only rows that still exist are updated; deleted ones are skipped.
  elsif v_surface = 'health' then
    update public.groups g
       set health_status = (x.health_status)::public.group_health_status,
           updated_at = now()
      from jsonb_to_recordset(
             coalesce(v_payload -> 'prior_group_health_status', '[]'::jsonb)
           ) as x(id uuid, health_status text)
     where g.id = x.id;
    update public.group_metric_settings s
       set manual_health_status_override =
             (x.manual_health_status_override)::public.group_health_status
      from jsonb_to_recordset(
             coalesce(v_payload -> 'prior_metric_overrides', '[]'::jsonb)
           ) as x(group_id uuid, manual_health_status_override text)
     where s.group_id = x.group_id;
    update public.group_health_updates u
       set follow_up_needed = true
      from jsonb_to_recordset(
             coalesce(v_payload -> 'prior_pulse_flags', '[]'::jsonb)
           ) as x(id uuid)
     where u.id = x.id;
  end if;

  update public.attention_reset_snapshots
     set restored_at = now(),
         restored_by = v_actor
   where id = v_snapshot.id;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values
    (v_actor, 'super_admin.reset_attention_revert', 'attention_reset_snapshots', v_snapshot.id,
     jsonb_build_object('surface', v_surface, 'scope', v_scope, 'entity_id', v_entity));

  return v_snapshot.id;
end;
$$;

revoke all     on function public.super_admin_reset_attention_revert(uuid) from public;
revoke all     on function public.super_admin_reset_attention_revert(uuid) from anon;
revoke all     on function public.super_admin_reset_attention_revert(uuid) from authenticated;
grant  execute on function public.super_admin_reset_attention_revert(uuid) to authenticated;

comment on function public.super_admin_reset_attention_revert(uuid) is
  'health-checks-reset: super-admin revert of an attention reset. Restores the prior baseline row(s) and (for care) the prior shepherd_care_profiles field values the reset overwrote, stamps restored_at/restored_by, and writes a paired super_admin.reset_attention_revert audit row. Raises missing_snapshot when there is nothing to restore; a second revert of the same snapshot is a no-op.';
