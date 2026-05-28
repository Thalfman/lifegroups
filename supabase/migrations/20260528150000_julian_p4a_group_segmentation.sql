-- Julian feedback P4a: group segmentation fields (prereq for the
-- multiplication candidate pipeline).
--
-- Julian's multiplication plan (LG_MULTIPLICATION_PLAN_2026.md) organizes
-- groups by gender category x stage of life, and his criteria reference how
-- long a group has been meeting ("3+ years"). The groups table has no
-- columns for any of this, so this migration adds:
--   * audience_category : men | women | mixed
--   * life_stage        : young_professionals | young_families | ...
--   * launched_on       : date the group launched (drives "3+ years")
-- All nullable so existing rows stay valid; admins fill them in over time.
--
-- Co-shepherd tenure ("1+ year") is NOT stored — it is derived from
-- group_leaders.assigned_at where role = 'co_leader' (see lib/admin/multiplication.ts).
--
-- Architecture parity with Phase 5A.5: writes flow through the existing
-- admin_create_group / admin_update_group SECURITY DEFINER RPCs, each paired
-- with an audit_events row; no new write RLS; no hard deletes.

-- ---------------------------------------------------------------------------
-- 1. New enums.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'group_audience_category') then
    create type public.group_audience_category as enum ('men','women','mixed');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'group_life_stage') then
    create type public.group_life_stage as enum (
      'young_professionals',
      'young_families',
      'families_with_kids',
      'families_with_adult_kids',
      'retirement',
      'multi_generational',
      'spanish_speaking'
    );
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 2. Columns on groups. All nullable.
-- ---------------------------------------------------------------------------

alter table public.groups
  add column if not exists audience_category public.group_audience_category;
alter table public.groups
  add column if not exists life_stage public.group_life_stage;
alter table public.groups
  add column if not exists launched_on date;

comment on column public.groups.audience_category is
  'Julian P4: men | women | mixed. Used to segment the multiplication pipeline.';
comment on column public.groups.life_stage is
  'Julian P4: stage-of-life bracket (young_professionals, retirement, ...). Used to segment the multiplication pipeline and the two-options-per-person coverage view.';
comment on column public.groups.launched_on is
  'Julian P4: date the group launched. Drives the "3+ years as a group" multiplication readiness criterion.';

-- ---------------------------------------------------------------------------
-- 3. Recreate admin_create_group with 3 new trailing params.
-- ---------------------------------------------------------------------------

drop function if exists public.admin_create_group(
  text, text, text, time, text, text, integer,
  public.meeting_frequency, public.meeting_week_parity
);

create or replace function public.admin_create_group(
  p_name text,
  p_description text,
  p_meeting_day text,
  p_meeting_time time,
  p_location_area text,
  p_address_optional text,
  p_capacity integer,
  p_meeting_frequency public.meeting_frequency,
  p_meeting_week_parity public.meeting_week_parity,
  p_audience_category public.group_audience_category,
  p_life_stage public.group_life_stage,
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
  v_frequency     := coalesce(p_meeting_frequency, 'weekly'::public.meeting_frequency);

  if v_frequency = 'biweekly' then
    v_parity := p_meeting_week_parity;
  else
    v_parity := null;
  end if;

  if v_name is null then
    raise exception 'invalid_input';
  end if;

  if p_capacity is not null and p_capacity < 0 then
    raise exception 'invalid_input';
  end if;

  insert into public.groups (
    name, description, meeting_day, meeting_time, location_area,
    address_optional, capacity, meeting_frequency, meeting_week_parity,
    lifecycle_status, health_status,
    audience_category, life_stage, launched_on
  )
  values (
    v_name, v_description, v_meeting_day, p_meeting_time, v_location_area,
    v_address, p_capacity, v_frequency, v_parity,
    'active'::public.group_lifecycle_status,
    'healthy'::public.group_health_status,
    p_audience_category, p_life_stage, p_launched_on
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
        'audience_category', p_audience_category,
        'life_stage', p_life_stage,
        'launched_on', p_launched_on
      )
    )
  );

  return v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Recreate admin_update_group with 3 new trailing params.
-- ---------------------------------------------------------------------------

drop function if exists public.admin_update_group(
  uuid, text, text, text, time, text, text, integer,
  public.meeting_frequency, public.meeting_week_parity
);

create or replace function public.admin_update_group(
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
  p_audience_category public.group_audience_category,
  p_life_stage public.group_life_stage,
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
  v_frequency     := coalesce(p_meeting_frequency, 'weekly'::public.meeting_frequency);

  if v_frequency = 'biweekly' then
    v_parity := p_meeting_week_parity;
  else
    v_parity := null;
  end if;

  if v_name is null then
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
           'audience_category', audience_category,
           'life_stage', life_stage,
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
         audience_category   = p_audience_category,
         life_stage          = p_life_stage,
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
    'audience_category', p_audience_category,
    'life_stage', p_life_stage,
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

-- ---------------------------------------------------------------------------
-- 5. Grants for the new 12- and 13-arg signatures.
-- ---------------------------------------------------------------------------

revoke all on function public.admin_create_group(
  text, text, text, time, text, text, integer,
  public.meeting_frequency, public.meeting_week_parity,
  public.group_audience_category, public.group_life_stage, date
) from public, anon, authenticated;
grant execute on function public.admin_create_group(
  text, text, text, time, text, text, integer,
  public.meeting_frequency, public.meeting_week_parity,
  public.group_audience_category, public.group_life_stage, date
) to authenticated;

revoke all on function public.admin_update_group(
  uuid, text, text, text, time, text, text, integer,
  public.meeting_frequency, public.meeting_week_parity,
  public.group_audience_category, public.group_life_stage, date
) from public, anon, authenticated;
grant execute on function public.admin_update_group(
  uuid, text, text, text, time, text, text, integer,
  public.meeting_frequency, public.meeting_week_parity,
  public.group_audience_category, public.group_life_stage, date
) to authenticated;

comment on function public.admin_create_group(
  text, text, text, time, text, text, integer,
  public.meeting_frequency, public.meeting_week_parity,
  public.group_audience_category, public.group_life_stage, date
) is 'Julian P4 admin write: inserts a groups row including segmentation (audience_category, life_stage, launched_on), plus an audit_events row.';

comment on function public.admin_update_group(
  uuid, text, text, text, time, text, text, integer,
  public.meeting_frequency, public.meeting_week_parity,
  public.group_audience_category, public.group_life_stage, date
) is 'Julian P4 admin write: updates a groups row including segmentation fields; does not touch lifecycle_status / closed_at. Writes an audit_events row.';
