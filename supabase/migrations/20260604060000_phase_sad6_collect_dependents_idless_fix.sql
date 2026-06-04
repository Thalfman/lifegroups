-- ADR 0014 (#313 follow-up): harden super_admin_collect_dependents against
-- dependent tables that have no `id` column.
--
-- The original helper read `jsonb_agg(t.id)` for EVERY inbound FK child up front,
-- before bucketing. That assumed every dependent table has an `id` column — but
-- some do not: group_metric_settings is an `on delete cascade` child of groups
-- whose primary key is `group_id` (no `id`). Deleting / previewing a Group would
-- then trip a raw `column "id" does not exist` error instead of the mapped
-- has_blocking_dependents blocker the engine promises. (check_function_bodies is
-- off, so this only surfaces at call time, not at migration apply.)
--
-- Fix: only read child ids for the set-null bucket — those are the dependents the
-- tombstone must capture for re-link, and every set-null child in the curated
-- schema has an `id` primary key. Blocker children (cascade / restrict /
-- no-action, incl. the id-less group_metric_settings) are only counted, never
-- id-read. Behavior is otherwise identical.

set check_function_bodies = off;

create or replace function public.super_admin_collect_dependents(
  p_table text,
  p_id uuid
)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_blockers jsonb := '[]'::jsonb;
  v_set_null jsonb := '[]'::jsonb;
  r record;
  v_count bigint;
  v_ids jsonb;
begin
  for r in
    select
      child.relname           as child_table,
      att.attname             as fk_column,
      con.confdeltype::text   as del_action
    from pg_constraint con
    join pg_class child   on child.oid = con.conrelid
    join pg_namespace cn  on cn.oid = child.relnamespace
    join pg_class parent  on parent.oid = con.confrelid
    join pg_namespace pn  on pn.oid = parent.relnamespace
    join pg_attribute att on att.attrelid = con.conrelid
                         and att.attnum = con.conkey[1]
    where con.contype = 'f'
      and array_length(con.conkey, 1) = 1
      and pn.nspname = 'public'
      and cn.nspname = 'public'
      and parent.relname = p_table
  loop
    -- Count the children pointing at p_id. The count alone classifies a blocker;
    -- only the set-null bucket needs the child ids (for re-link), so id-less
    -- blocker tables (e.g. group_metric_settings) are never id-read.
    execute format(
      'select count(*) from public.%I t where t.%I = $1',
      r.child_table, r.fk_column
    )
    into v_count
    using p_id;

    if v_count = 0 then
      continue;
    end if;

    if r.del_action = 'n' then
      -- Every set-null dependent in the curated schema has an `id` primary key.
      execute format(
        'select coalesce(jsonb_agg(t.id), ''[]''::jsonb) from public.%I t where t.%I = $1',
        r.child_table, r.fk_column
      )
      into v_ids
      using p_id;

      v_set_null := v_set_null || jsonb_build_object(
        'table', r.child_table,
        'column', r.fk_column,
        'count', v_count,
        'ids', v_ids
      );
    else
      v_blockers := v_blockers || jsonb_build_object(
        'table', r.child_table,
        'column', r.fk_column,
        'action', r.del_action,
        'count', v_count
      );
    end if;
  end loop;

  return jsonb_build_object('blockers', v_blockers, 'set_null', v_set_null);
end;
$$;

revoke all on function public.super_admin_collect_dependents(text, uuid) from public;
revoke all on function public.super_admin_collect_dependents(text, uuid) from anon;
revoke all on function public.super_admin_collect_dependents(text, uuid) from authenticated;

comment on function public.super_admin_collect_dependents(text, uuid) is
  'ADR 0014 (#312/#313): reusable inbound-FK dependent preflight keyed on FK action. Only the set-null bucket reads child ids (for re-link); blocker children are counted only, so id-less dependent tables (e.g. group_metric_settings) are handled. Internal helper.';
