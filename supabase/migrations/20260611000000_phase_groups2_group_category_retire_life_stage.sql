-- Tag a group with a category; retire the life_stage enum as the segmentation
-- source (#398 / Settings Overhaul PRD §2.1, §3). This is wave-2 of the groups
-- overhaul, building on the wave-1 catalog + cell matrix
-- (20260610000000_phase_groups1_category_catalog_and_matrix.sql):
--
--   * groups gains a nullable category_id FK into the group_categories catalog.
--     A group "joins a cell" by carrying a category under its audience_category
--     (top type). NULL = Uncategorized — the visible bucket for untagged groups.
--   * category_id REPLACES life_stage as the single source of truth for a
--     group's cell. The life_stage column is DROPPED here so no code path can
--     keep reading it; the enum TYPE is left in place because dropping a column
--     does not require dropping its type, and a future slice may reuse it.
--   * admin_create_group / admin_update_group are recreated to take p_category_id
--     in place of p_life_stage, threading the new column through the audited
--     write path (each still writes its paired audit_events row).
--
-- Start fresh: existing groups have category_id NULL (Uncategorized) until an
-- admin tags them. No backfill from life_stage — the two vocabularies don't map
-- 1:1 (life_stage was a fixed enum; categories are free-form per ministry).
--
-- Architecture parity with the wave-1 migration + Phase 5A.5: writes flow
-- through the SECURITY DEFINER RPCs with a pinned search_path + auth_is_admin()
-- guard + auth_profile_id() actor + a paired audit row; EXECUTE locked down.

-- ---------------------------------------------------------------------------
-- 1. New column on groups: the category FK. Nullable; NULL = Uncategorized.
--    on delete set null so archiving/removing a category never orphans a group
--    or deletes it — the group simply falls back to Uncategorized.
-- ---------------------------------------------------------------------------

alter table public.groups
  add column if not exists category_id uuid
    references public.group_categories(id) on delete set null;

comment on column public.groups.category_id is
  'Groups overhaul (#398): the catalog category this group carries under its audience_category (top type) — the group''s cell. NULL = Uncategorized. Replaces the retired life_stage column as the single segmentation source. FK on delete set null so an archived/removed category drops the group back to Uncategorized rather than orphaning it.';

-- ---------------------------------------------------------------------------
-- 2. Recreate admin_create_group: p_category_id REPLACES p_life_stage. Drop the
--    prior 12-arg overload (the life_stage signature) so only one remains.
-- ---------------------------------------------------------------------------

drop function if exists public.admin_create_group(
  text, text, text, time, text, text, integer,
  public.meeting_frequency, public.meeting_week_parity,
  public.group_audience_category, public.group_life_stage, date
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
  p_category_id uuid,
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

  -- A non-null category must name an ACTIVE cell for this top type — the same
  -- applied (audience_category × category) the Settings matrix exposes and the
  -- form picker offers. Joining the live catalog also enforces the category is
  -- non-archived. This blocks a stale or tampered form persisting a group into
  -- an unapplied/archived cell (which the picker never offers), corrupting the
  -- segmentation, coverage and readiness the cell feeds downstream.
  if p_category_id is not null and not exists (
    select 1
      from public.category_type_targets ctt
      join public.group_categories gc on gc.id = ctt.category_id
     where ctt.category_id = p_category_id
       and ctt.audience_category = p_audience_category::text
       and ctt.active
       and gc.archived_at is null
  ) then
    raise exception 'inactive_cell';
  end if;

  insert into public.groups (
    name, description, meeting_day, meeting_time, location_area,
    address_optional, capacity, meeting_frequency, meeting_week_parity,
    lifecycle_status, health_status,
    audience_category, category_id, launched_on
  )
  values (
    v_name, v_description, v_meeting_day, p_meeting_time, v_location_area,
    v_address, p_capacity, v_frequency, v_parity,
    'active'::public.group_lifecycle_status,
    'healthy'::public.group_health_status,
    p_audience_category, p_category_id, p_launched_on
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
        'category_id', p_category_id,
        'launched_on', p_launched_on
      )
    )
  );

  return v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Recreate admin_update_group: p_category_id REPLACES p_life_stage.
-- ---------------------------------------------------------------------------

drop function if exists public.admin_update_group(
  uuid, text, text, text, time, text, text, integer,
  public.meeting_frequency, public.meeting_week_parity,
  public.group_audience_category, public.group_life_stage, date
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
  p_category_id uuid,
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

  -- A non-null category must name an ACTIVE cell for this top type — same gate
  -- as create. An edit can't move a group into an unapplied/archived cell the
  -- matrix doesn't expose, which would corrupt segmentation. Joining the live
  -- catalog also enforces the category is non-archived.
  if p_category_id is not null and not exists (
    select 1
      from public.category_type_targets ctt
      join public.group_categories gc on gc.id = ctt.category_id
     where ctt.category_id = p_category_id
       and ctt.audience_category = p_audience_category::text
       and ctt.active
       and gc.archived_at is null
  ) then
    raise exception 'inactive_cell';
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
           'category_id', category_id,
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
         category_id         = p_category_id,
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
    'category_id', p_category_id,
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
-- 4. Grants for the recreated category_id signatures (deny by default, allow
--    authenticated). Mirrors the wave-1 lockdown idiom.
-- ---------------------------------------------------------------------------

revoke all on function public.admin_create_group(
  text, text, text, time, text, text, integer,
  public.meeting_frequency, public.meeting_week_parity,
  public.group_audience_category, uuid, date
) from public, anon, authenticated;
grant execute on function public.admin_create_group(
  text, text, text, time, text, text, integer,
  public.meeting_frequency, public.meeting_week_parity,
  public.group_audience_category, uuid, date
) to authenticated;

revoke all on function public.admin_update_group(
  uuid, text, text, text, time, text, text, integer,
  public.meeting_frequency, public.meeting_week_parity,
  public.group_audience_category, uuid, date
) from public, anon, authenticated;
grant execute on function public.admin_update_group(
  uuid, text, text, text, time, text, text, integer,
  public.meeting_frequency, public.meeting_week_parity,
  public.group_audience_category, uuid, date
) to authenticated;

comment on function public.admin_create_group(
  text, text, text, time, text, text, integer,
  public.meeting_frequency, public.meeting_week_parity,
  public.group_audience_category, uuid, date
) is 'Groups overhaul (#398) admin write: inserts a groups row including segmentation (audience_category, category_id, launched_on); rejects a non-live category_id; writes a paired audit_events row. Replaces the prior life_stage signature.';

comment on function public.admin_update_group(
  uuid, text, text, text, time, text, text, integer,
  public.meeting_frequency, public.meeting_week_parity,
  public.group_audience_category, uuid, date
) is 'Groups overhaul (#398) admin write: updates a groups row including segmentation (audience_category, category_id, launched_on); rejects a non-live category_id; does not touch lifecycle_status / closed_at. Writes a paired audit_events row. Replaces the prior life_stage signature.';

-- ---------------------------------------------------------------------------
-- 5. Retire life_stage as the segmentation source: DROP the column. Done LAST
--    so the recreated RPCs (which no longer touch it) are already in place. The
--    group_life_stage enum TYPE is intentionally kept (dropping a column does
--    not require dropping its type; keeping it avoids breaking any other object
--    and leaves it available for reuse).
-- ---------------------------------------------------------------------------

alter table public.groups drop column if exists life_stage;
