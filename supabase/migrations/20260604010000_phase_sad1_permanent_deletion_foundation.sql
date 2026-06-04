-- ADR 0014 (#312): Super Admin Permanent Deletion — foundation tracer bullet.
--
-- Builds the entire spine end-to-end against the lowest-blast entity, a Launch
-- Scenario (launch_planning_scenarios), so later slices only register new entity
-- types against a proven pattern:
--
--   * tombstones — a Super-Admin-readable, never-deletable store of every
--     physically removed row: its full JSON snapshot PLUS a snapshot of the
--     `on delete set null` dependents the delete nulled (child table, fk column,
--     row ids) so #315 can re-link them on restore.
--   * super_admin_deletable_table(entity_type) — the curated allowlist resolver
--     mapping a public entity_type token to its table. Returns null for anything
--     not registered; later slices extend the CASE. tombstones, audit_events,
--     audit_events_archive and the private-care-note tables are deliberately
--     never registered, so they can never be permanent-deletion targets.
--   * super_admin_collect_dependents(table, id) — walks pg_constraint for every
--     inbound FK and buckets dependents by FK action: cascade / restrict /
--     no-action are blockers; set-null dependents are captured (table, column,
--     ids) for the tombstone, not blocked. #313/#314/#316 reuse it.
--   * super_admin_permanent_delete(entity_type, id) — the audited
--     `super_admin_*` SECURITY DEFINER delete RPC gated on
--     auth_role() = 'super_admin' (NOT admin_*, which is Ministry-Admin
--     callable). Snapshots-then-deletes in one transaction and writes BOTH the
--     tombstone and the paired audit_events row. No service-role key.
--
-- This foundation slice does NOT yet refuse blocking dependents (that is #313):
-- a Launch Scenario has no inbound FKs, so the set-null capture path is what is
-- exercised here. The type-to-confirm phrase is enforced in the server action
-- (the RPC, like the Clean Slate RPCs, never sees the phrase).

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- tombstones — the recoverable record of every permanent deletion.
-- ---------------------------------------------------------------------------
create table if not exists public.tombstones (
  id uuid primary key default gen_random_uuid(),
  -- The public entity_type token (e.g. 'launch_scenario') and the resolved
  -- table, captured so restore (#315) does not have to re-resolve the token.
  entity_type text not null,
  table_name text not null,
  entity_id uuid not null,
  -- Full to_jsonb(row) snapshot captured before removal — the re-insert source.
  row_snapshot jsonb not null,
  -- The set-null dependents this delete nulled: [{table, column, ids:[...]}],
  -- so restore can re-link the children back to the re-inserted row.
  set_null_dependents jsonb not null default '[]'::jsonb,
  deleted_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz not null default now(),
  -- Set when #315 restores this tombstone; the tombstone is retained after.
  restored_at timestamptz,
  restored_by uuid references public.profiles(id) on delete set null
);

create index if not exists idx_tombstones_deleted_at
  on public.tombstones (deleted_at desc);

alter table public.tombstones enable row level security;

-- Single SELECT policy, super-admin only (mirrors audit_events / clean_slate).
-- No INSERT/UPDATE/DELETE policy: only the SECURITY DEFINER RPCs write here, and
-- the table is never itself a permanent-deletion target (it is not registered in
-- super_admin_deletable_table).
create policy tombstones_super_admin_read
  on public.tombstones
  for select to authenticated using (public.auth_role() = 'super_admin');

revoke all    on public.tombstones from public;
revoke all    on public.tombstones from anon;
revoke all    on public.tombstones from authenticated;
grant  select on public.tombstones to authenticated;

comment on table public.tombstones is
  'ADR 0014 (#312): Super-Admin-readable record of every permanent deletion — full row snapshot + the set-null dependents nulled by the delete. Never itself a delete target. Writes only via the super_admin_* SECURITY DEFINER RPCs.';

-- ---------------------------------------------------------------------------
-- super_admin_deletable_table(entity_type) — curated allowlist resolver.
-- Internal helper (no EXECUTE grant): reachable only from the SECURITY DEFINER
-- RPCs below. Returns the table for a registered entity_type, else null. Later
-- slices extend the CASE; the set of registered types IS the curated scope.
-- ---------------------------------------------------------------------------
create or replace function public.super_admin_deletable_table(p_entity_type text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_entity_type
    -- #312 foundation: the lowest-blast operational entity.
    when 'launch_scenario' then 'launch_planning_scenarios'
    else null
  end;
$$;

revoke all on function public.super_admin_deletable_table(text) from public;
revoke all on function public.super_admin_deletable_table(text) from anon;
revoke all on function public.super_admin_deletable_table(text) from authenticated;

comment on function public.super_admin_deletable_table(text) is
  'ADR 0014 (#312): curated permanent-deletion allowlist. Maps an entity_type token to its table, or null if not a registered target. Internal helper — extended per slice (#313/#314/#316).';

-- ---------------------------------------------------------------------------
-- super_admin_collect_dependents(table, id) — FK-action dependent preflight.
-- Internal helper (no EXECUTE grant). Walks every inbound FK referencing
-- p_table via pg_constraint and, for the rows that actually point at p_id,
-- buckets them by the FK's on-delete action (pg_constraint.confdeltype):
--   'c' cascade, 'r' restrict, 'a' no action, 'd' set default  -> blocker
--   'n' set null                                               -> captured
-- Returns { "blockers": [{table,column,action,count}],
--           "set_null": [{table,column,count,ids:[...]}] }.
-- Single-column FKs only (every FK to the curated entities is single-column).
-- ---------------------------------------------------------------------------
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
    -- Count the children pointing at p_id, and (for the set-null bucket only)
    -- collect their ids so restore can re-link them. Every set-null dependent
    -- in the curated schema has an `id` primary key.
    execute format(
      'select count(*), coalesce(jsonb_agg(t.id), ''[]''::jsonb) from public.%I t where t.%I = $1',
      r.child_table, r.fk_column
    )
    into v_count, v_ids
    using p_id;

    if v_count = 0 then
      continue;
    end if;

    if r.del_action = 'n' then
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
  'ADR 0014 (#312/#313): reusable inbound-FK dependent preflight keyed on FK action. cascade/restrict/no-action/set-default = blocker; set-null = captured (with ids) for the tombstone. Internal helper reused by the delete RPC + preflight.';

-- ---------------------------------------------------------------------------
-- super_admin_permanent_delete(entity_type, id) — the audited delete RPC.
-- Gate super_admin; resolve the curated table (forbidden_target if not
-- registered); snapshot the row + its set-null dependents into a tombstone;
-- write the paired audit_events row; delete the row — all in one transaction.
-- #312 does NOT refuse blocking dependents yet (#313 adds that); a Launch
-- Scenario has none, so this exercises the snapshot + set-null capture spine.
-- Returns the tombstone id.
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

  -- Curated scope: only registered entity types are deletable. tombstones,
  -- audit rows and private care notes are never registered.
  v_table := public.super_admin_deletable_table(p_entity_type);
  if v_table is null then
    raise exception 'forbidden_target';
  end if;

  -- Snapshot the row before anything mutates. missing_entity if it is gone.
  execute format('select to_jsonb(t) from public.%I t where t.id = $1', v_table)
    into v_row
    using p_id;
  if v_row is null then
    raise exception 'missing_entity';
  end if;

  -- Capture the set-null dependents this delete will null, so restore can
  -- re-link them. (#313 adds the cascade/restrict/no-action blocker refusal.)
  v_deps := public.super_admin_collect_dependents(v_table, p_id);

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
  'ADR 0014 (#312): super-admin curated permanent deletion. Snapshots the row + its set-null dependents into a tombstone, writes the paired super_admin.permanent_delete audit row, and deletes the row in one transaction. forbidden_target for unregistered types; missing_entity when the row is gone.';
