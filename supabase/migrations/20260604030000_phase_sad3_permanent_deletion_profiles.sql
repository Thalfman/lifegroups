-- ADR 0014 (#314): Permanent deletion — People / Profiles.
--
-- Registers People / Profiles as a permanent-deletion target, honoring the
-- boundaries from ADR 0014:
--
--   1. public.profiles row ONLY — never auth.users. The generic delete engine
--      resolves 'profile' -> 'profiles' and deletes that row; auth.users is
--      never touched, so the no-service-role-key invariant (ADR 0001) holds. The
--      login is left orphaned/inert; disable/re-enable stays the normal lever.
--   2. Block by FK action (reuses #313's helper). set-null authorship FKs do not
--      block; cascade/restrict do.
--   3. audit_events.actor_profile_id migrates to ON DELETE SET NULL (so it falls
--      under the set-null "not a blocker" rule), and audit_events +
--      audit_events_archive (and the reset copy RPC) gain a denormalized actor
--      descriptor (name + email), written at insert by a trigger and backfilled,
--      so a deleted profile's past actions keep their attribution.
--   4. Private Care Notes = permanent blocker, reported OPAQUELY (#313 hook).
--   5. ANY super_admin target is forbidden.

set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- 1. audit_events.actor_profile_id -> ON DELETE SET NULL.
-- The column shipped with a bare `references profiles(id)` (no on-delete
-- clause), so it behaved like restrict and would block deleting any profile that
-- ever acted. Re-point it to SET NULL so the audit row survives with its actor
-- link nulled (attribution preserved via the descriptor below).
-- ---------------------------------------------------------------------------
alter table public.audit_events
  drop constraint if exists audit_events_actor_profile_id_fkey;
alter table public.audit_events
  add constraint audit_events_actor_profile_id_fkey
  foreign key (actor_profile_id) references public.profiles(id)
  on delete set null;

-- ---------------------------------------------------------------------------
-- 2. Denormalized actor descriptor on audit_events AND audit_events_archive.
-- The feed renders "by <name>" by joining actor_profile_id to a live profile;
-- nulling that link alone would strip attribution from every past action of a
-- deleted profile. The descriptor preserves name + email at write time so the
-- live feed AND the archive keep attribution after the actor is deleted.
-- ---------------------------------------------------------------------------
alter table public.audit_events add column if not exists actor_name text;
alter table public.audit_events add column if not exists actor_email text;
alter table public.audit_events_archive add column if not exists actor_name text;
alter table public.audit_events_archive add column if not exists actor_email text;

-- Backfill existing rows from current profiles (one-time, in this migration).
update public.audit_events ae
   set actor_name = p.full_name,
       actor_email = p.email
  from public.profiles p
 where ae.actor_profile_id = p.id
   and ae.actor_name is null;

update public.audit_events_archive ae
   set actor_name = p.full_name,
       actor_email = p.email
  from public.profiles p
 where ae.actor_profile_id = p.id
   and ae.actor_name is null;

-- Write the descriptor at insert time for every audit row, from any RPC, without
-- touching each RPC: a BEFORE INSERT trigger fills name + email from the actor's
-- profile when they were not supplied. Once the actor is later deleted (FK
-- nulled) the descriptor persists.
create or replace function public.audit_events_set_actor_descriptor()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (new.actor_name is null or new.actor_email is null)
     and new.actor_profile_id is not null then
    select p.full_name, p.email
      into new.actor_name, new.actor_email
      from public.profiles p
     where p.id = new.actor_profile_id;
  end if;
  return new;
end;
$$;

revoke all on function public.audit_events_set_actor_descriptor() from public;
revoke all on function public.audit_events_set_actor_descriptor() from anon;
revoke all on function public.audit_events_set_actor_descriptor() from authenticated;

drop trigger if exists trg_audit_events_actor_descriptor on public.audit_events;
create trigger trg_audit_events_actor_descriptor
  before insert on public.audit_events
  for each row execute function public.audit_events_set_actor_descriptor();

comment on function public.audit_events_set_actor_descriptor() is
  'ADR 0014 (#314): denormalize the actor name + email onto each audit_events row at insert, so attribution survives the actor''s permanent deletion (actor_profile_id nulls under ON DELETE SET NULL).';

-- ---------------------------------------------------------------------------
-- 3. Reset RPC carries the descriptor into the archive. Without this, a Super
-- Admin could reset audit logs then delete the actor, re-introducing lost
-- attribution in the archived history.
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

  delete from public.audit_events;

  insert into public.audit_events
    (id, actor_profile_id, action, entity_type, entity_id, metadata)
  values
    (v_new_id, v_actor, 'super_admin.reset_audit_logs', 'audit_events', null,
     jsonb_build_object('archived_count', v_count));

  return v_new_id;
end;
$$;

revoke all     on function public.super_admin_reset_audit_logs() from public;
revoke all     on function public.super_admin_reset_audit_logs() from anon;
revoke all     on function public.super_admin_reset_audit_logs() from authenticated;
grant  execute on function public.super_admin_reset_audit_logs() to authenticated;

comment on function public.super_admin_reset_audit_logs() is
  'PRD-SAC6 (#290) + ADR 0014 (#314): super-admin audit-log reset. Archives current audit_events (now incl. the actor descriptor) into audit_events_archive, purges, then writes one fresh super_admin.reset_audit_logs row carrying the prior count.';

-- ---------------------------------------------------------------------------
-- 4. Register the profile target.
-- ---------------------------------------------------------------------------
create or replace function public.super_admin_deletable_table(p_entity_type text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_entity_type
    when 'launch_scenario' then 'launch_planning_scenarios'
    when 'group' then 'groups'
    -- #314: People / Profiles — only the public.profiles row, never auth.users.
    when 'profile' then 'profiles'
    else null
  end;
$$;

revoke all on function public.super_admin_deletable_table(text) from public;
revoke all on function public.super_admin_deletable_table(text) from anon;
revoke all on function public.super_admin_deletable_table(text) from authenticated;

-- ---------------------------------------------------------------------------
-- 5. Confidential block: a profile (or its care profile) with SC.4 private
-- notes can never be permanently deleted. Existence check only — no content is
-- read, and the engine/preflight report it opaquely.
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
    return exists (
      select 1
        from public.shepherd_care_private_notes n
        join public.shepherd_care_profiles cp on cp.id = n.care_profile_id
       where cp.shepherd_profile_id = p_id
    );
  end if;
  return false;
end;
$$;

revoke all on function public.super_admin_confidential_block(text, uuid) from public;
revoke all on function public.super_admin_confidential_block(text, uuid) from anon;
revoke all on function public.super_admin_confidential_block(text, uuid) from authenticated;

-- ---------------------------------------------------------------------------
-- 6. Engine: add the super_admin forbidden-target guard for profiles. Everything
-- else (table resolution, confidential block, blocker refusal, snapshot +
-- tombstone + audit + delete) is unchanged from #313.
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

  -- Opaque permanent block: confidential records (SC.4) can never be deleted.
  if public.super_admin_confidential_block(p_entity_type, p_id) then
    raise exception 'has_confidential_records';
  end if;

  execute format('select to_jsonb(t) from public.%I t where t.id = $1', v_table)
    into v_row
    using p_id;
  if v_row is null then
    raise exception 'missing_entity';
  end if;

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
  'ADR 0014 (#312–#314): super-admin curated permanent deletion. Forbids unregistered + super_admin targets (forbidden_target), confidential records (opaque), and cascade/restrict/no-action blockers. Deletes only public.profiles for a profile — auth.users is never touched.';

-- ---------------------------------------------------------------------------
-- 7. Preflight: reflect the super_admin forbidden-target guard for profiles.
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

  if p_entity_type = 'profile'
     and exists (select 1 from public.profiles where id = p_id and role = 'super_admin')
  then
    return jsonb_build_object('deletable', false, 'forbidden', true);
  end if;

  if public.super_admin_confidential_block(p_entity_type, p_id) then
    return jsonb_build_object('deletable', false, 'confidential', true);
  end if;

  v_deps := public.super_admin_collect_dependents(v_table, p_id);
  v_blockers := v_deps->'blockers';

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
  'ADR 0014 (#313/#314): super-admin permanent-deletion preflight. Reports forbidden targets (incl. super_admin profiles), the opaque confidential block, and the named cascade/restrict/no-action blockers + set-null preview.';
