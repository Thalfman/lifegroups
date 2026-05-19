-- Phase 5A.5: Group meeting schedule cleanup.
--
-- Adds structured meeting cadence fields to public.groups:
--   * meeting_frequency : weekly | biweekly | monthly (NOT NULL, default 'weekly')
--   * meeting_week_parity : odd | even (NULL allowed; only meaningful when biweekly)
--   * tightens meeting_day to the canonical Sunday-Saturday names via CHECK
--
-- Architecture follows Phase 5A.2:
--   * Writes flow through SECURITY DEFINER RPCs (admin_create_group, admin_update_group).
--   * No new INSERT/UPDATE/DELETE policies on groups; RLS stays SELECT-only outside
--     the RPC surface.
--   * No hard deletes. No service_role / supabaseAdmin usage in app code.
--   * Every write pairs with an audit_events insert in the same transaction.

-- ---------------------------------------------------------------------------
-- 1. New enums for meeting cadence.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'meeting_frequency') then
    create type public.meeting_frequency as enum ('weekly','biweekly','monthly');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'meeting_week_parity') then
    create type public.meeting_week_parity as enum ('odd','even');
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 2. Add columns. meeting_frequency defaults to 'weekly' so existing rows
--    backfill safely; meeting_week_parity stays null unless explicitly set.
-- ---------------------------------------------------------------------------

alter table public.groups
  add column if not exists meeting_frequency public.meeting_frequency not null default 'weekly';

alter table public.groups
  add column if not exists meeting_week_parity public.meeting_week_parity;

-- ---------------------------------------------------------------------------
-- 3. Normalize legacy meeting_day capitalization, then add the canonical
--    check constraint. initcap('TUESDAY') -> 'Tuesday', initcap('tuesday')
--    -> 'Tuesday'. Existing seed data already uses Capitalized names; this
--    pass just guards against drift.
-- ---------------------------------------------------------------------------

update public.groups
   set meeting_day = initcap(lower(meeting_day))
 where meeting_day is not null
   and meeting_day <> initcap(lower(meeting_day));

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'groups_meeting_day_canonical'
  ) then
    alter table public.groups
      add constraint groups_meeting_day_canonical
        check (
          meeting_day is null
          or meeting_day in (
            'Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'
          )
        );
  end if;
end$$;

-- Parity is only allowed when the group meets bi-weekly. Defense in depth:
-- the RPC layer also coerces parity to null for weekly/monthly frequencies.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'groups_meeting_week_parity_only_biweekly'
  ) then
    alter table public.groups
      add constraint groups_meeting_week_parity_only_biweekly
        check (
          meeting_week_parity is null
          or meeting_frequency = 'biweekly'
        );
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 4. Recreate admin_create_group with the new parameters.
--
-- Because we're widening the parameter list, drop the prior signature first.
-- `create or replace function` cannot change parameter counts. Dropping the
-- old signature also revokes its grants, which the new signature re-grants
-- explicitly below.
-- ---------------------------------------------------------------------------

drop function if exists public.admin_create_group(
  text, text, text, time, text, text, integer
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
  p_meeting_week_parity public.meeting_week_parity
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

  -- Parity is only meaningful for bi-weekly groups; coerce to null otherwise
  -- so weekly/monthly callers don't have to remember to clear it client-side.
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
    name,
    description,
    meeting_day,
    meeting_time,
    location_area,
    address_optional,
    capacity,
    meeting_frequency,
    meeting_week_parity,
    lifecycle_status,
    health_status
  )
  values (
    v_name,
    v_description,
    v_meeting_day,
    p_meeting_time,
    v_location_area,
    v_address,
    p_capacity,
    v_frequency,
    v_parity,
    'active'::public.group_lifecycle_status,
    'healthy'::public.group_health_status
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
        'meeting_week_parity', v_parity
      )
    )
  );

  return v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Recreate admin_update_group with the new parameters.
-- ---------------------------------------------------------------------------

drop function if exists public.admin_update_group(
  uuid, text, text, text, time, text, text, integer
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
  p_meeting_week_parity public.meeting_week_parity
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
           'meeting_week_parity', meeting_week_parity
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
         meeting_week_parity = v_parity
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
    'meeting_week_parity', v_parity
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
-- 6. Grants. Match the Phase 5A.2 pattern: revoke from public/anon/authenticated,
--    then grant execute to authenticated only. The function body still
--    enforces auth_is_admin().
-- ---------------------------------------------------------------------------

revoke all on function public.admin_create_group(
  text, text, text, time, text, text, integer,
  public.meeting_frequency, public.meeting_week_parity
) from public;
revoke all on function public.admin_create_group(
  text, text, text, time, text, text, integer,
  public.meeting_frequency, public.meeting_week_parity
) from anon;
revoke all on function public.admin_create_group(
  text, text, text, time, text, text, integer,
  public.meeting_frequency, public.meeting_week_parity
) from authenticated;
grant  execute on function public.admin_create_group(
  text, text, text, time, text, text, integer,
  public.meeting_frequency, public.meeting_week_parity
) to authenticated;

revoke all on function public.admin_update_group(
  uuid, text, text, text, time, text, text, integer,
  public.meeting_frequency, public.meeting_week_parity
) from public;
revoke all on function public.admin_update_group(
  uuid, text, text, text, time, text, text, integer,
  public.meeting_frequency, public.meeting_week_parity
) from anon;
revoke all on function public.admin_update_group(
  uuid, text, text, text, time, text, text, integer,
  public.meeting_frequency, public.meeting_week_parity
) from authenticated;
grant  execute on function public.admin_update_group(
  uuid, text, text, text, time, text, text, integer,
  public.meeting_frequency, public.meeting_week_parity
) to authenticated;

comment on function public.admin_create_group(
  text, text, text, time, text, text, integer,
  public.meeting_frequency, public.meeting_week_parity
) is 'Phase 5A.5 admin write: inserts a groups row including meeting cadence (frequency + optional bi-weekly parity), plus an audit_events row in the same transaction.';

comment on function public.admin_update_group(
  uuid, text, text, text, time, text, text, integer,
  public.meeting_frequency, public.meeting_week_parity
) is 'Phase 5A.5 admin write: updates a groups row''s descriptive columns including meeting cadence; does not touch lifecycle_status / closed_at. Writes an audit_events row.';
