-- ADR 0014 (#313): Permanent deletion — Groups, dependent blocking + report.
--
-- Registers Groups as a permanent-deletion target and proves the block + report
-- dependency rule. A Group fans out widely (leaders, memberships, calendar
-- events, check-ins, group-health, the multiplication + leader pipelines), so
-- deletion must REFUSE when blocking dependents exist and report what is
-- blocking — never silently cascade or null data unrecoverably.
--
-- This slice evolves the foundation engine (#312) via create-or-replace:
--   * super_admin_deletable_table() gains the 'group' branch.
--   * super_admin_confidential_block() is introduced as the opaque
--     permanent-blocker hook (Private Care Notes, SC.4). It returns false here —
--     no group entity has confidential records — and #314 extends it for
--     profiles. Encoding the carve-out in a reusable resolver keeps the opaque
--     "this person has confidential records" path in one place.
--   * super_admin_permanent_delete() now REFUSES when collect_dependents finds
--     any cascade / restrict / no-action (default) blocker, raising
--     has_blocking_dependents instead of cascading.
--   * super_admin_permanent_delete_preflight() is added so the danger-zone panel
--     can name the blockers (with counts) BEFORE attempting a delete, and
--     surface the opaque confidential block.
--
-- The reusable super_admin_collect_dependents() helper from #312 already keys on
-- FK action; #314 and #316 reuse exactly this engine by registering their tables.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- super_admin_confidential_block(entity_type, id) — the opaque permanent block.
-- Internal helper. Returns true when the target holds SC.4 private care notes
-- that escape the Super Admin (ADR 0002/0003) and so can never be permanently
-- deleted. Reported OPAQUELY by the engine/preflight (no table/count/key-slot
-- metadata leaks). #313 has no confidential entity (groups never hold notes);
-- #314 extends this for profiles + care profiles.
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
  -- No registered entity in this slice can hold private care notes.
  return false;
end;
$$;

revoke all on function public.super_admin_confidential_block(text, uuid) from public;
revoke all on function public.super_admin_confidential_block(text, uuid) from anon;
revoke all on function public.super_admin_confidential_block(text, uuid) from authenticated;

comment on function public.super_admin_confidential_block(text, uuid) is
  'ADR 0014 (#313/#314): opaque permanent-blocker hook. True when the target holds SC.4 private care notes (cannot be permanently deleted; disable instead). Reported opaquely — no count/table/key-slot metadata. Internal helper.';

-- ---------------------------------------------------------------------------
-- super_admin_deletable_table() — add the Groups branch.
-- ---------------------------------------------------------------------------
create or replace function public.super_admin_deletable_table(p_entity_type text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_entity_type
    when 'launch_scenario' then 'launch_planning_scenarios'
    -- #313: Groups — proves the block + report dependency rule.
    when 'group' then 'groups'
    else null
  end;
$$;

revoke all on function public.super_admin_deletable_table(text) from public;
revoke all on function public.super_admin_deletable_table(text) from anon;
revoke all on function public.super_admin_deletable_table(text) from authenticated;

-- ---------------------------------------------------------------------------
-- super_admin_permanent_delete() — now refuses blocking dependents.
-- Gate super_admin; resolve the curated table (forbidden_target); refuse the
-- opaque confidential block (has_confidential_records); preflight dependents and
-- REFUSE if any cascade/restrict/no-action blocker exists
-- (has_blocking_dependents); else snapshot the row + its set-null dependents
-- into a tombstone, write the paired audit row, and delete — one transaction.
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

  -- Opaque permanent block: confidential records (SC.4) can never be deleted.
  if public.super_admin_confidential_block(p_entity_type, p_id) then
    raise exception 'has_confidential_records';
  end if;

  -- Snapshot the row before anything mutates. missing_entity if it is gone.
  execute format('select to_jsonb(t) from public.%I t where t.id = $1', v_table)
    into v_row
    using p_id;
  if v_row is null then
    raise exception 'missing_entity';
  end if;

  -- Preflight dependents by FK action. Refuse when any cascade / restrict /
  -- no-action (default) blocker exists — never silently cascade or null
  -- unrecoverably. The operator archives/clears the blockers first.
  v_deps := public.super_admin_collect_dependents(v_table, p_id);
  v_blockers := v_deps->'blockers';
  if jsonb_array_length(v_blockers) > 0 then
    raise exception 'has_blocking_dependents';
  end if;

  insert into public.tombstones
    (id, entity_type, table_name, entity_id, row_snapshot, set_null_dependents, deleted_by)
  values
    (v_tombstone_id, p_entity_type, v_table, p_id, v_row, v_deps->'set_null', v_actor);

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'super_admin.permanent_delete',
    v_table,
    p_id,
    jsonb_build_object('entity_type', p_entity_type, 'tombstone_id', v_tombstone_id)
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
  'ADR 0014 (#312/#313): super-admin curated permanent deletion. Refuses unregistered types (forbidden_target), confidential records (has_confidential_records, opaque), and cascade/restrict/no-action blockers (has_blocking_dependents). On a clean delete: snapshots the row + set-null dependents to a tombstone, writes the paired audit row, deletes the row.';

-- ---------------------------------------------------------------------------
-- super_admin_permanent_delete_preflight(entity_type, id) — report blockers.
-- Super-admin-gated read RPC the danger-zone panel calls before attempting a
-- delete. Returns a jsonb report:
--   { deletable, forbidden, confidential, blockers:[{table,column,action,count}],
--     set_null:[{table,column,count}] }
-- The confidential block is reported opaquely: when true, NO blocker / set-null
-- detail is returned, so the security-definer preflight cannot leak private-note
-- existence (count/table/key-slot) to the Super Admin.
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
  v_blockers jsonb;
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

  -- Opaque: report only the boolean, never any detail.
  if public.super_admin_confidential_block(p_entity_type, p_id) then
    return jsonb_build_object('deletable', false, 'confidential', true);
  end if;

  v_deps := public.super_admin_collect_dependents(v_table, p_id);
  v_blockers := v_deps->'blockers';

  -- Strip captured ids from the set-null preview — the UI only needs counts.
  for r in select * from jsonb_array_elements(v_deps->'set_null')
  loop
    v_set_null := v_set_null || jsonb_build_object(
      'table', r->>'table',
      'column', r->>'column',
      'count', r->'count'
    );
  end loop;

  return jsonb_build_object(
    'deletable', jsonb_array_length(v_blockers) = 0,
    'forbidden', false,
    'confidential', false,
    'blockers', v_blockers,
    'set_null', v_set_null
  );
end;
$$;

revoke all     on function public.super_admin_permanent_delete_preflight(text, uuid) from public;
revoke all     on function public.super_admin_permanent_delete_preflight(text, uuid) from anon;
revoke all     on function public.super_admin_permanent_delete_preflight(text, uuid) from authenticated;
grant  execute on function public.super_admin_permanent_delete_preflight(text, uuid) to authenticated;

comment on function public.super_admin_permanent_delete_preflight(text, uuid) is
  'ADR 0014 (#313): super-admin permanent-deletion preflight. Names the cascade/restrict/no-action blockers (with counts) and the set-null dependents a delete would null, and reports the opaque confidential block. No mutation.';
