-- Collapse the Cell (Audience × Category) model to a free-text Group-Type list.
--
-- The groups overhaul modelled a group's segmentation as a CELL = Audience
-- (men/women/mixed) × Category (a free-form label catalog), with per-cell config
-- (target counts, trigger overrides) and a three-tier readiness cascade
-- (global → per-audience → per-cell). The ministry wants maximum flexibility
-- instead of that fixed 2-D grid, so a group's "type" becomes a single free-text
-- string the ministry sets to WHATEVER it wants, chosen from an admin-managed
-- list. Audience is removed entirely. Per-type config (a target count + an
-- optional readiness-rule override) is re-keyed from the cell coordinate onto the
-- free-text type name.
--
-- AUTHORIZED DESTRUCTIVE SCHEMA CHANGE. "Remove all existing group types and
-- configs for groups" means the cell tables/columns and their data are dropped.
-- CLAUDE.md's no-hard-delete invariant governs APP WORKFLOWS (soft-archive via
-- RPC), not one-time schema migrations; this migration drops tables/columns by
-- design. Existing group_type values start empty (groups fall back to Untyped).
--
-- Architecture parity with the surrounding admin RPCs: every write is a SECURITY
-- DEFINER function with a pinned search_path + auth_is_admin() guard +
-- auth_profile_id() actor + a paired audit_events row in the same transaction;
-- no new INSERT/UPDATE/DELETE policies (the function surface is the only write
-- path); EXECUTE locked down (revoke from public/anon/authenticated, grant
-- authenticated).

-- ===========================================================================
-- 1. Drop the cell/category/per-type RPCs, and the group/prospect/candidate
--    RPCs whose signatures change. Dropped by name (all overloads) so signature
--    drift across the groups-overhaul slices can't leave a stale overload behind
--    (plpgsql bodies don't create table dependencies, so the table drops below
--    would not remove them).
-- ===========================================================================

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         -- Removed entirely (catalog + cell + per-type config).
         'admin_create_group_category',
         'admin_rename_group_category',
         'admin_archive_group_category',
         'admin_set_category_type_cell',
         'admin_set_category_type_target_count',
         'admin_set_group_category',
         'admin_set_audience_readiness_rule',
         'admin_set_cell_trigger_overrides',
         'admin_set_multiplication_config',
         -- Recreated below with new signatures (cell params removed).
         'admin_create_group',
         'admin_update_group',
         'admin_create_prospect',
         'admin_create_multiplication_candidate',
         'admin_update_multiplication_candidate'
       )
  loop
    execute 'drop function if exists ' || r.sig;
  end loop;
end$$;

-- ===========================================================================
-- 2. Drop the cell tables. category_type_targets FKs group_categories, so it
--    goes first; group_categories is dropped last (section 6) once the columns
--    FKing it are gone. multiplication_readiness_rule (the GLOBAL rule) is kept.
-- ===========================================================================

drop table if exists public.category_type_targets;
drop table if exists public.audience_readiness_rule;
drop table if exists public.multiplication_config;

-- ===========================================================================
-- 3. groups: drop the cell coordinate, add the free-text type. Dropping a
--    column drops its FK + any dependent index/constraint with it.
-- ===========================================================================

alter table public.groups
  drop column if exists audience_category,
  drop column if exists category_id,
  add  column if not exists group_type text;

alter table public.groups
  add constraint groups_group_type_len
    check (group_type is null or char_length(group_type) <= 80);

comment on column public.groups.group_type is
  'Free-text group type the ministry sets to anything it wants, chosen from the admin-managed group_types list (app_settings). null = Untyped. Replaces the retired audience_category × category_id cell as the single segmentation source.';

-- ===========================================================================
-- 4. prospects: drop the desired-cell columns (dropping the columns drops
--    prospects_desired_cell_idx + prospects_desired_audience_valid with them).
-- ===========================================================================

alter table public.prospects
  drop column if exists desired_audience_category,
  drop column if exists desired_category_id;

-- ===========================================================================
-- 5. multiplication_candidates: drop the cell anchor. A candidate now derives
--    its type from its group; type-only watches are retired. Dropping the
--    columns drops multiplication_candidates_one_active_type_only with them.
-- ===========================================================================

-- A type-only watch (group_id null) carried its intent ONLY in the cell columns
-- about to drop, and the new planner requires a concrete group. Soft-archive any
-- active type-only rows first (Archive convention) so they leave the active
-- pipeline cleanly instead of lingering as an Untyped, group-less candidate the
-- planner can't save. Rows with a group are untouched (their type follows the
-- group). No-op when there are none.
--
-- The archive is a mutation, so it carries a paired audit_events row per row
-- retired (audit-integrity invariant) — captured via RETURNING so the insert
-- runs in the same statement/transaction as the update. actor_profile_id is
-- null: this is a one-time, system-initiated migration with no app actor.
with archived as (
  update public.multiplication_candidates
     set archived_at = now(),
         updated_at  = now()
   where group_id is null
     and archived_at is null
  returning id
)
insert into public.audit_events
  (actor_profile_id, action, entity_type, entity_id, metadata)
select
  null,
  'admin.archive_multiplication_candidate',
  'multiplication_candidates',
  archived.id,
  jsonb_build_object(
    'reason', 'collapse_cells_migration',
    'kind', 'type_only_watch_retired',
    'migration', '20260708000000_collapse_cells_to_group_type_list'
  )
from archived;

alter table public.multiplication_candidates
  drop column if exists audience_category,
  drop column if exists category_id;

-- ===========================================================================
-- 6. Drop the category catalog now that nothing FKs it.
-- ===========================================================================

drop table if exists public.group_categories;

-- ===========================================================================
-- 7. Recreate admin_create_group / admin_update_group: p_group_type REPLACES
--    p_audience_category + p_category_id. No cell-liveness check — the type is
--    free-text; the picker is a convenience, not a constraint.
-- ===========================================================================

create function public.admin_create_group(
  p_name text,
  p_description text,
  p_meeting_day text,
  p_meeting_time time,
  p_location_area text,
  p_address_optional text,
  p_capacity integer,
  p_meeting_frequency public.meeting_frequency,
  p_meeting_week_parity public.meeting_week_parity,
  p_group_type text,
  p_launched_on date
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_name text;
  v_description text;
  v_meeting_day text;
  v_location_area text;
  v_address text;
  v_group_type text;
  v_frequency public.meeting_frequency;
  v_parity public.meeting_week_parity;
  v_new_id uuid;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  v_name          := nullif(btrim(coalesce(p_name, '')), '');
  v_description   := nullif(btrim(coalesce(p_description, '')), '');
  v_meeting_day   := nullif(btrim(coalesce(p_meeting_day, '')), '');
  v_location_area := nullif(btrim(coalesce(p_location_area, '')), '');
  v_address       := nullif(btrim(coalesce(p_address_optional, '')), '');
  v_group_type    := nullif(btrim(coalesce(p_group_type, '')), '');
  v_frequency     := coalesce(p_meeting_frequency, 'weekly'::public.meeting_frequency);

  if v_frequency = 'biweekly' then
    v_parity := p_meeting_week_parity;
  else
    v_parity := null;
  end if;

  if v_name is null then
    raise exception 'invalid_input';
  end if;

  if v_group_type is not null and char_length(v_group_type) > 80 then
    raise exception 'invalid_input';
  end if;

  if p_capacity is not null and p_capacity < 0 then
    raise exception 'invalid_input';
  end if;

  insert into public.groups (
    name, description, meeting_day, meeting_time, location_area,
    address_optional, capacity, meeting_frequency, meeting_week_parity,
    lifecycle_status, health_status, group_type, launched_on
  )
  values (
    v_name, v_description, v_meeting_day, p_meeting_time, v_location_area,
    v_address, p_capacity, v_frequency, v_parity,
    'active'::public.group_lifecycle_status,
    'healthy'::public.group_health_status,
    v_group_type, p_launched_on
  )
  returning id into v_new_id;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.create_group',
    'groups',
    v_new_id,
    jsonb_build_object(
      'after',
      jsonb_build_object(
        'name', v_name,
        'lifecycle_status', 'active',
        'health_status', 'healthy',
        'meeting_day', v_meeting_day,
        'location_area', v_location_area,
        'capacity', p_capacity,
        'meeting_frequency', v_frequency,
        'meeting_week_parity', v_parity,
        'group_type', v_group_type,
        'launched_on', p_launched_on
      )
    )
  );

  return v_new_id;
end;
$$;

create function public.admin_update_group(
  p_group_id uuid,
  p_name text,
  p_description text,
  p_meeting_day text,
  p_meeting_time time,
  p_location_area text,
  p_address_optional text,
  p_capacity integer,
  p_meeting_frequency public.meeting_frequency,
  p_meeting_week_parity public.meeting_week_parity,
  p_group_type text,
  p_launched_on date
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_name text;
  v_description text;
  v_meeting_day text;
  v_location_area text;
  v_address text;
  v_group_type text;
  v_frequency public.meeting_frequency;
  v_parity public.meeting_week_parity;
  v_before jsonb;
  v_after jsonb;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  v_name          := nullif(btrim(coalesce(p_name, '')), '');
  v_description   := nullif(btrim(coalesce(p_description, '')), '');
  v_meeting_day   := nullif(btrim(coalesce(p_meeting_day, '')), '');
  v_location_area := nullif(btrim(coalesce(p_location_area, '')), '');
  v_address       := nullif(btrim(coalesce(p_address_optional, '')), '');
  v_group_type    := nullif(btrim(coalesce(p_group_type, '')), '');
  v_frequency     := coalesce(p_meeting_frequency, 'weekly'::public.meeting_frequency);

  if v_frequency = 'biweekly' then
    v_parity := p_meeting_week_parity;
  else
    v_parity := null;
  end if;

  if v_name is null then
    raise exception 'invalid_input';
  end if;

  if v_group_type is not null and char_length(v_group_type) > 80 then
    raise exception 'invalid_input';
  end if;

  if p_capacity is not null and p_capacity < 0 then
    raise exception 'invalid_input';
  end if;

  select jsonb_build_object(
           'name', name,
           'description', description,
           'meeting_day', meeting_day,
           'meeting_time', meeting_time,
           'location_area', location_area,
           'address_optional', address_optional,
           'capacity', capacity,
           'meeting_frequency', meeting_frequency,
           'meeting_week_parity', meeting_week_parity,
           'group_type', group_type,
           'launched_on', launched_on
         )
    into v_before
    from public.groups
   where id = p_group_id
   for update;

  if v_before is null then
    raise exception 'missing_group';
  end if;

  update public.groups
     set name                = v_name,
         description         = v_description,
         meeting_day         = v_meeting_day,
         meeting_time        = p_meeting_time,
         location_area       = v_location_area,
         address_optional    = v_address,
         capacity            = p_capacity,
         meeting_frequency   = v_frequency,
         meeting_week_parity = v_parity,
         group_type          = v_group_type,
         launched_on         = p_launched_on
   where id = p_group_id;

  v_after := jsonb_build_object(
    'name', v_name,
    'description', v_description,
    'meeting_day', v_meeting_day,
    'meeting_time', p_meeting_time,
    'location_area', v_location_area,
    'address_optional', v_address,
    'capacity', p_capacity,
    'meeting_frequency', v_frequency,
    'meeting_week_parity', v_parity,
    'group_type', v_group_type,
    'launched_on', p_launched_on
  );

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.update_group',
    'groups',
    p_group_id,
    jsonb_build_object('before', v_before, 'after', v_after)
  );

  return p_group_id;
end;
$$;

revoke all on function public.admin_create_group(
  text, text, text, time, text, text, integer,
  public.meeting_frequency, public.meeting_week_parity, text, date
) from public, anon, authenticated;
grant execute on function public.admin_create_group(
  text, text, text, time, text, text, integer,
  public.meeting_frequency, public.meeting_week_parity, text, date
) to authenticated;

revoke all on function public.admin_update_group(
  uuid, text, text, text, time, text, text, integer,
  public.meeting_frequency, public.meeting_week_parity, text, date
) from public, anon, authenticated;
grant execute on function public.admin_update_group(
  uuid, text, text, text, time, text, text, integer,
  public.meeting_frequency, public.meeting_week_parity, text, date
) to authenticated;

comment on function public.admin_create_group(
  text, text, text, time, text, text, integer,
  public.meeting_frequency, public.meeting_week_parity, text, date
) is 'Admin write: inserts a groups row including the free-text group_type + launched_on; writes a paired audit_events row. Replaces the prior audience_category/category_id cell signature.';
comment on function public.admin_update_group(
  uuid, text, text, text, time, text, text, integer,
  public.meeting_frequency, public.meeting_week_parity, text, date
) is 'Admin write: updates a groups row including the free-text group_type + launched_on; does not touch lifecycle_status/closed_at. Writes a paired audit_events row. Replaces the prior audience_category/category_id cell signature.';

-- ===========================================================================
-- 8. Recreate admin_create_prospect without the desired-cell params.
-- ===========================================================================

create function public.admin_create_prospect(
  p_full_name text,
  p_email     text,
  p_phone     text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_name  text;
  v_email text;
  v_phone text;
  v_id    uuid;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  v_name := nullif(btrim(coalesce(p_full_name, '')), '');
  if v_name is null then
    raise exception 'invalid_input';
  end if;
  if char_length(v_name) > 120 then
    raise exception 'invalid_input';
  end if;
  v_email := nullif(btrim(coalesce(p_email, '')), '');
  v_phone := nullif(btrim(coalesce(p_phone, '')), '');

  insert into public.prospects (full_name, email, phone, state, created_by, updated_by)
  values (v_name, v_email, v_phone, 'interested', v_actor, v_actor)
  returning id into v_id;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.create_prospect',
    'prospects',
    v_id,
    jsonb_build_object(
      'has_email', v_email is not null,
      'has_phone', v_phone is not null,
      'state', 'interested'
    )
  );

  return v_id;
end;
$$;

revoke all on function public.admin_create_prospect(text, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_create_prospect(text, text, text)
  to authenticated;

comment on function public.admin_create_prospect(text, text, text) is
  'Interest Funnel admin write: creates a Prospect in the interested state. Writes a paired audit_events row. The desired-cell intake columns were retired with the cell model.';

-- ===========================================================================
-- 9. Recreate admin_create / admin_update_multiplication_candidate without the
--    cell anchor. A candidate now always anchors to a concrete group (type-only
--    watches were retired with the cell model); the type is the group's type.
-- ===========================================================================

create function public.admin_create_multiplication_candidate(
  p_group_id            uuid,
  p_target_year         integer,
  p_status              public.multiplication_candidate_status,
  p_shepherd_willing    boolean,
  p_needs_similar_stage boolean,
  p_notes               text,
  p_successor_designate text,
  p_meeting_time        public.multiplication_meeting_time,
  p_leader_pipeline_id  uuid,
  p_manual_member_count integer
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_notes text;
  v_successor text;
  v_status public.multiplication_candidate_status;
  v_group_found boolean;
  v_apprentice_group uuid;
  v_new_id uuid;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_group_id is null then
    raise exception 'invalid_input';
  end if;

  if p_target_year is not null and (p_target_year < 2024 or p_target_year > 2100) then
    raise exception 'invalid_input';
  end if;

  if p_manual_member_count is not null
     and (p_manual_member_count < 0 or p_manual_member_count > 1000) then
    raise exception 'invalid_input';
  end if;

  v_notes := nullif(btrim(coalesce(p_notes, '')), '');
  if v_notes is not null and char_length(v_notes) > 2000 then
    raise exception 'invalid_input';
  end if;

  v_successor := nullif(btrim(coalesce(p_successor_designate, '')), '');
  if v_successor is not null and char_length(v_successor) > 120 then
    raise exception 'invalid_input';
  end if;

  v_status := coalesce(p_status, 'watching'::public.multiplication_candidate_status);

  select true into v_group_found
    from public.groups where id = p_group_id for update;
  if v_group_found is null then
    raise exception 'missing_group';
  end if;
  if exists (
    select 1 from public.multiplication_candidates
     where group_id = p_group_id and archived_at is null
  ) then
    raise exception 'candidate_exists';
  end if;

  if p_leader_pipeline_id is not null then
    select group_id into v_apprentice_group
      from public.leader_pipeline
     where id = p_leader_pipeline_id and archived_at is null;
    if v_apprentice_group is null then
      raise exception 'missing_apprentice';
    end if;
    if v_apprentice_group <> p_group_id then
      raise exception 'apprentice_group_mismatch';
    end if;
  end if;

  insert into public.multiplication_candidates (
    group_id, target_year, status, shepherd_willing, needs_similar_stage,
    notes, successor_designate, meeting_time, leader_pipeline_id,
    manual_member_count, created_by, updated_by
  )
  values (
    p_group_id, p_target_year, v_status,
    coalesce(p_shepherd_willing, false), coalesce(p_needs_similar_stage, false),
    v_notes, v_successor, p_meeting_time, p_leader_pipeline_id,
    p_manual_member_count, v_actor, v_actor
  )
  returning id into v_new_id;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.create_multiplication_candidate',
    'multiplication_candidates',
    v_new_id,
    jsonb_build_object('after', jsonb_build_object(
      'group_id', p_group_id,
      'target_year', p_target_year, 'status', v_status,
      'shepherd_willing', coalesce(p_shepherd_willing, false),
      'needs_similar_stage', coalesce(p_needs_similar_stage, false),
      'has_notes', v_notes is not null,
      'has_successor', v_successor is not null,
      'meeting_time', p_meeting_time,
      'has_apprentice_link', p_leader_pipeline_id is not null,
      'manual_member_count', p_manual_member_count
    ))
  );

  return v_new_id;
end;
$$;

create function public.admin_update_multiplication_candidate(
  p_candidate_id        uuid,
  p_target_year         integer,
  p_status              public.multiplication_candidate_status,
  p_shepherd_willing    boolean,
  p_needs_similar_stage boolean,
  p_notes               text,
  p_successor_designate text,
  p_meeting_time        public.multiplication_meeting_time,
  p_leader_pipeline_id  uuid,
  p_manual_member_count integer,
  p_group_id            uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_notes text;
  v_successor text;
  v_status public.multiplication_candidate_status;
  v_exists boolean;
  v_group_found boolean;
  v_apprentice_group uuid;
  v_before jsonb;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_group_id is null then
    raise exception 'invalid_input';
  end if;

  if p_target_year is not null and (p_target_year < 2024 or p_target_year > 2100) then
    raise exception 'invalid_input';
  end if;

  if p_manual_member_count is not null
     and (p_manual_member_count < 0 or p_manual_member_count > 1000) then
    raise exception 'invalid_input';
  end if;

  v_notes := nullif(btrim(coalesce(p_notes, '')), '');
  if v_notes is not null and char_length(v_notes) > 2000 then
    raise exception 'invalid_input';
  end if;

  v_successor := nullif(btrim(coalesce(p_successor_designate, '')), '');
  if v_successor is not null and char_length(v_successor) > 120 then
    raise exception 'invalid_input';
  end if;

  v_status := coalesce(p_status, 'watching'::public.multiplication_candidate_status);

  select true, jsonb_build_object(
           'group_id', group_id,
           'target_year', target_year, 'status', status,
           'shepherd_willing', shepherd_willing,
           'needs_similar_stage', needs_similar_stage,
           'has_notes', notes is not null,
           'has_successor', successor_designate is not null,
           'meeting_time', meeting_time,
           'has_apprentice_link', leader_pipeline_id is not null,
           'manual_member_count', manual_member_count
         )
    into v_exists, v_before
    from public.multiplication_candidates
   where id = p_candidate_id and archived_at is null
   for update;

  if v_exists is null then
    raise exception 'missing_candidate';
  end if;

  select true into v_group_found
    from public.groups where id = p_group_id for update;
  if v_group_found is null then
    raise exception 'missing_group';
  end if;
  if exists (
    select 1 from public.multiplication_candidates
     where group_id = p_group_id and archived_at is null
       and id <> p_candidate_id
  ) then
    raise exception 'candidate_exists';
  end if;

  if p_leader_pipeline_id is not null then
    select group_id into v_apprentice_group
      from public.leader_pipeline
     where id = p_leader_pipeline_id and archived_at is null;
    if v_apprentice_group is null then
      raise exception 'missing_apprentice';
    end if;
    if v_apprentice_group <> p_group_id then
      raise exception 'apprentice_group_mismatch';
    end if;
  end if;

  update public.multiplication_candidates
     set group_id            = p_group_id,
         target_year         = p_target_year,
         status              = v_status,
         shepherd_willing    = coalesce(p_shepherd_willing, false),
         needs_similar_stage = coalesce(p_needs_similar_stage, false),
         notes               = v_notes,
         successor_designate = v_successor,
         meeting_time        = p_meeting_time,
         leader_pipeline_id  = p_leader_pipeline_id,
         manual_member_count = p_manual_member_count,
         updated_by          = v_actor
   where id = p_candidate_id;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.update_multiplication_candidate',
    'multiplication_candidates',
    p_candidate_id,
    jsonb_build_object('before', v_before, 'after', jsonb_build_object(
      'group_id', p_group_id,
      'target_year', p_target_year, 'status', v_status,
      'shepherd_willing', coalesce(p_shepherd_willing, false),
      'needs_similar_stage', coalesce(p_needs_similar_stage, false),
      'has_notes', v_notes is not null,
      'has_successor', v_successor is not null,
      'meeting_time', p_meeting_time,
      'has_apprentice_link', p_leader_pipeline_id is not null,
      'manual_member_count', p_manual_member_count
    ))
  );

  return p_candidate_id;
end;
$$;

revoke all on function public.admin_create_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text,
  text, public.multiplication_meeting_time, uuid, integer
) from public, anon, authenticated;
grant execute on function public.admin_create_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text,
  text, public.multiplication_meeting_time, uuid, integer
) to authenticated;

revoke all on function public.admin_update_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text,
  text, public.multiplication_meeting_time, uuid, integer, uuid
) from public, anon, authenticated;
grant execute on function public.admin_update_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text,
  text, public.multiplication_meeting_time, uuid, integer, uuid
) to authenticated;

comment on function public.admin_create_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text,
  text, public.multiplication_meeting_time, uuid, integer
) is 'Admin write: adds a multiplication candidate anchored to a concrete group (one active per group), with an optional same-group apprentice link + Julian-fed member count. The type is the group''s group_type. Writes a paired audit_events row.';
comment on function public.admin_update_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text,
  text, public.multiplication_meeting_time, uuid, integer, uuid
) is 'Admin write: updates a multiplication candidate, including re-attaching its multiplying group + same-group apprentice link. Writes a paired audit_events row.';

-- ===========================================================================
-- 10. New table: per-type config keyed on the free-text type name. Holds a
--     target group count + an optional readiness-rule override (null = inherit
--     the global multiplication_readiness_rule). Decoupled from the list: a
--     config row may outlive a type's removal from the list (harmless), and a
--     listed type with no config row inherits the global rule + target 0.
-- ===========================================================================

create table if not exists public.group_type_configs (
  id             uuid primary key default gen_random_uuid(),
  group_type     text not null,
  target_count   integer not null default 0,
  readiness_rule jsonb,
  created_by     uuid references public.profiles(id) on delete set null,
  updated_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint group_type_configs_group_type_not_blank
    check (length(btrim(group_type)) > 0),
  constraint group_type_configs_group_type_len
    check (char_length(group_type) <= 80),
  constraint group_type_configs_target_count_nonneg
    check (target_count >= 0),
  constraint group_type_configs_readiness_is_object
    check (readiness_rule is null or jsonb_typeof(readiness_rule) = 'object')
);

-- One config row per type, on the NORMALIZED (trimmed, case-insensitive)
-- identity — every consumer keys types by lower(btrim(name)) (the group_types
-- list dedupes case-insensitively; the coverage/override maps fold case), so the
-- DB key matches that identity. This blocks case-only twins ("Men's" vs "men's")
-- a direct insert/seed could otherwise create, which the coverage roll-up would
-- silently collapse to whichever row was read last.
create unique index if not exists group_type_configs_group_type_norm_unique
  on public.group_type_configs (lower(btrim(group_type)));

drop trigger if exists group_type_configs_set_updated_at on public.group_type_configs;
create trigger group_type_configs_set_updated_at
  before update on public.group_type_configs
  for each row execute function public.set_updated_at();

alter table public.group_type_configs enable row level security;

drop policy if exists group_type_configs_admin_read on public.group_type_configs;
create policy group_type_configs_admin_read
  on public.group_type_configs
  for select to authenticated using (public.auth_is_admin());

revoke all    on public.group_type_configs from public;
revoke all    on public.group_type_configs from anon;
revoke all    on public.group_type_configs from authenticated;
grant  select on public.group_type_configs to authenticated;

comment on table public.group_type_configs is
  'Per-group-type config keyed on the free-text group_type name: a target group count + an optional readiness-rule override (null = inherit the global multiplication_readiness_rule). Admin-only RLS; writes only via admin_set_group_type_config.';

-- ===========================================================================
-- 11. Seed the free-text group_types list (app_settings keyed row). Empty list
--     for a fresh ministry; do nothing on re-run so operator edits stand.
-- ===========================================================================

insert into public.app_settings (setting_key, setting_value)
values ('group_types', jsonb_build_object('types', '[]'::jsonb))
on conflict (setting_key) do nothing;

-- ===========================================================================
-- 12. RPC: admin_set_group_types — replace the canonical type-name list.
--     Validates a jsonb array of trimmed, non-empty, case-insensitively deduped
--     names (≤80 chars each, ≤100 total), preserving order.
-- ===========================================================================

create function public.admin_set_group_types(p_types jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor  uuid;
  v_row_id uuid;
  v_before jsonb;
  v_after  jsonb;
  v_elem   jsonb;
  v_name   text;
  v_types  jsonb := '[]'::jsonb;
  v_seen   text[] := array[]::text[];
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_types is null or jsonb_typeof(p_types) <> 'array' then
    raise exception 'invalid_input';
  end if;

  for v_elem in select * from jsonb_array_elements(p_types) loop
    if jsonb_typeof(v_elem) <> 'string' then
      raise exception 'invalid_input';
    end if;
    v_name := btrim(v_elem #>> '{}');
    if v_name = '' then
      continue;
    end if;
    if char_length(v_name) > 80 then
      raise exception 'invalid_input';
    end if;
    if lower(v_name) = any(v_seen) then
      continue;
    end if;
    v_seen  := array_append(v_seen, lower(v_name));
    v_types := v_types || to_jsonb(v_name);
  end loop;

  if jsonb_array_length(v_types) > 100 then
    raise exception 'invalid_input';
  end if;

  select id, setting_value into v_row_id, v_before
    from public.app_settings
   where setting_key = 'group_types'
   for update;

  if v_row_id is null then
    insert into public.app_settings (setting_key, setting_value)
    values ('group_types', jsonb_build_object('types', v_types))
    returning id, '{}'::jsonb into v_row_id, v_before;
  else
    update public.app_settings
       set setting_value = jsonb_build_object('types', v_types)
     where id = v_row_id;
  end if;

  v_after := jsonb_build_object('types', v_types);

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.set_group_types',
    'app_settings',
    v_row_id,
    jsonb_build_object('before', v_before, 'after', v_after)
  );

  return v_row_id;
end;
$$;

revoke all on function public.admin_set_group_types(jsonb) from public, anon, authenticated;
grant execute on function public.admin_set_group_types(jsonb) to authenticated;

comment on function public.admin_set_group_types(jsonb) is
  'Admin write: replaces the canonical free-text group_types list in app_settings (trimmed, deduped, ≤80 chars each, ≤100 total). Writes a paired audit_events row.';

-- ===========================================================================
-- 13. RPC: admin_set_group_type_config — upsert one type's target + readiness
--     override. An empty/null readiness_rule clears the override (inherit global).
-- ===========================================================================

create function public.admin_set_group_type_config(
  p_group_type     text,
  p_target_count   integer,
  p_readiness_rule jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor  uuid;
  v_type   text;
  v_target integer;
  v_rule   jsonb;
  v_row_id uuid;
  v_before jsonb;
  v_after  jsonb;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  v_type := nullif(btrim(coalesce(p_group_type, '')), '');
  if v_type is null or char_length(v_type) > 80 then
    raise exception 'invalid_input';
  end if;

  v_target := coalesce(p_target_count, 0);
  if v_target < 0 or v_target > 1000 then
    raise exception 'invalid_input';
  end if;

  -- A null or empty-object rule clears the override (inherit the global rule).
  if p_readiness_rule is null or p_readiness_rule = '{}'::jsonb then
    v_rule := null;
  elsif jsonb_typeof(p_readiness_rule) <> 'object' then
    raise exception 'invalid_input';
  else
    v_rule := p_readiness_rule;
  end if;

  -- Serialize concurrent upserts for the SAME (normalized) type before the
  -- snapshot. For a brand-new type, SELECT ... FOR UPDATE locks nothing (no row
  -- yet), so two racers would both read `before` empty and the loser would
  -- clobber the winner while auditing an empty before. A per-key advisory xact
  -- lock — the same pattern as 20260617000000_phase_groups7 — closes that race;
  -- the two int4 keys namespace the lock to this table + the normalized name.
  perform pg_advisory_xact_lock(
    hashtext('group_type_configs'),
    hashtext(lower(v_type))
  );

  -- Match on the NORMALIZED identity (the unique index key) so a case-only
  -- variant updates the existing row rather than spawning a twin.
  select id, jsonb_build_object('target_count', target_count, 'readiness_rule', readiness_rule)
    into v_row_id, v_before
    from public.group_type_configs
   where lower(btrim(group_type)) = lower(v_type)
   for update;

  if v_row_id is null then
    insert into public.group_type_configs (group_type, target_count, readiness_rule, created_by, updated_by)
    values (v_type, v_target, v_rule, v_actor, v_actor)
    returning id into v_row_id;
  else
    update public.group_type_configs
       set group_type     = v_type,
           target_count   = v_target,
           readiness_rule = v_rule,
           updated_by     = v_actor
     where id = v_row_id;
  end if;

  v_after := jsonb_build_object('target_count', v_target, 'readiness_rule', v_rule);

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.set_group_type_config',
    'group_type_configs',
    v_row_id,
    jsonb_build_object(
      'group_type', v_type,
      'before', coalesce(v_before, jsonb_build_object()),
      'after',  v_after
    )
  );

  return v_row_id;
end;
$$;

revoke all on function public.admin_set_group_type_config(text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.admin_set_group_type_config(text, integer, jsonb) to authenticated;

comment on function public.admin_set_group_type_config(text, integer, jsonb) is
  'Admin write: upserts one group type''s config (target group count + optional readiness-rule override, null/empty = inherit global) keyed on the free-text type name. Writes a paired audit_events row.';
