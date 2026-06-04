-- ADR 0014 (#315): Permanent deletion — recovery by tombstone re-import.
--
-- Makes permanent deletion recoverable, as ADR 0014 promises. The tombstone
-- captured at delete time (#312) holds the full row JSON plus the set-null
-- dependents the delete nulled; this RPC lets a Super Admin restore a tombstoned
-- row from it — re-inserting the row AND re-linking the nulled set-null
-- dependents — reusing the Clean Slate restore shape (type-to-confirm phrase in
-- the action, authoritative validation here).
--
-- End-to-end: a Super Admin views recent tombstones in the danger zone, picks
-- one, confirms with the RESTORE RECORD phrase, and the row is re-inserted from
-- its snapshot and the captured set-null child links are restored to point back
-- at it. Restore is audited (paired audit_events row); restoring does NOT delete
-- the tombstone.
--
-- Fails cleanly if the row id already exists again (id_already_exists, no silent
-- overwrite), if the snapshot references a parent that no longer exists
-- (missing_parent). Re-link is best-effort: a set-null child that no longer
-- exists is skipped and counted, not failed.

set check_function_bodies = off;

create or replace function public.super_admin_restore_tombstone(
  p_tombstone_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_tomb public.tombstones;
  v_dep jsonb;
  v_child text;
  v_col text;
  v_ids uuid[];
  v_updated bigint;
  v_relinked bigint := 0;
  v_skipped bigint := 0;
begin
  if public.auth_role() <> 'super_admin' then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  select * into v_tomb
    from public.tombstones
   where id = p_tombstone_id
   for update;
  if v_tomb.id is null then
    raise exception 'missing_tombstone';
  end if;

  -- No silent overwrite: if the id exists again, refuse.
  execute format('select 1 from public.%I where id = $1', v_tomb.table_name)
    using v_tomb.entity_id;
  if found then
    raise exception 'id_already_exists';
  end if;

  -- Re-insert the row from its full snapshot. jsonb_populate_record fills every
  -- captured column (id / created_at / FKs preserved). Map the two recoverable
  -- failure modes to readable tokens.
  begin
    execute format(
      'insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)',
      v_tomb.table_name, v_tomb.table_name
    )
    using v_tomb.row_snapshot;
  exception
    when unique_violation then
      raise exception 'id_already_exists';
    when foreign_key_violation then
      raise exception 'missing_parent';
  end;

  -- Re-link the captured set-null dependents back to the restored row. Update
  -- only children that still exist (matched by id); missing children are skipped
  -- and counted (best-effort, reported — not a hard failure).
  for v_dep in select * from jsonb_array_elements(v_tomb.set_null_dependents)
  loop
    v_child := v_dep->>'table';
    v_col := v_dep->>'column';
    select coalesce(
             array_agg((value #>> '{}')::uuid),
             '{}'::uuid[]
           )
      into v_ids
      from jsonb_array_elements(v_dep->'ids') as value;

    if array_length(v_ids, 1) is null then
      continue;
    end if;

    execute format(
      'update public.%I set %I = $1 where id = any($2)',
      v_child, v_col
    )
    using v_tomb.entity_id, v_ids;
    get diagnostics v_updated = row_count;

    v_relinked := v_relinked + v_updated;
    v_skipped := v_skipped + (array_length(v_ids, 1) - v_updated);
  end loop;

  -- Retain the tombstone after a successful restore; stamp who/when.
  update public.tombstones
     set restored_at = now(),
         restored_by = v_actor
   where id = v_tomb.id;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'super_admin.restore_tombstone',
    v_tomb.table_name,
    v_tomb.entity_id,
    jsonb_build_object(
      'tombstone_id', v_tomb.id,
      'entity_type', v_tomb.entity_type,
      'relinked', v_relinked,
      'skipped', v_skipped
    )
  );

  return jsonb_build_object(
    'tombstone_id', v_tomb.id,
    'entity_type', v_tomb.entity_type,
    'entity_id', v_tomb.entity_id,
    'relinked', v_relinked,
    'skipped', v_skipped
  );
end;
$$;

revoke all     on function public.super_admin_restore_tombstone(uuid) from public;
revoke all     on function public.super_admin_restore_tombstone(uuid) from anon;
revoke all     on function public.super_admin_restore_tombstone(uuid) from authenticated;
grant  execute on function public.super_admin_restore_tombstone(uuid) to authenticated;

comment on function public.super_admin_restore_tombstone(uuid) is
  'ADR 0014 (#315): super-admin tombstone restore. Re-inserts the snapshotted row (id_already_exists / missing_parent on conflict) and re-links the captured set-null dependents (best-effort, skipped children reported), stamps restored_at/by, retains the tombstone, and writes a paired super_admin.restore_tombstone audit row.';
