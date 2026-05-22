-- LP.2 — Forecast Scenarios for Capacity & Launch Planning.
--
-- Builds on LP.1 (20260518190000_phase_lp1_launch_planning.sql). The
-- single `launch_planning_assumptions` app_settings row stays as the
-- "baseline" assumption set; this slice adds a separate table holding
-- named scenarios so Julian can author and compare Conservative /
-- Expected / Stretch alongside the baseline.
--
-- Adds:
--   * launch_planning_scenarios   — named, soft-archivable scenarios.
--                                   At most one is_current scenario at a
--                                   time (partial unique index).
--   * four SECURITY DEFINER RPCs (admin-only):
--       - admin_create_launch_planning_scenario
--       - admin_update_launch_planning_scenario
--       - admin_archive_launch_planning_scenario
--       - admin_set_current_launch_planning_scenario
--     Every write pairs with an audit_events row in the same transaction.
--
-- Privacy posture matches LP.1:
--   * RLS SELECT uses public.auth_is_admin(). staff_viewer must NOT see
--     scenario rows.
--   * NO insert/update/delete table policies. Writes only through the
--     SECURITY DEFINER RPCs declared here.
--   * Each scenario's `assumptions.notes` body is NEVER stored in audit
--     metadata. The audit row instead records a has_notes boolean,
--     mirroring the LP.1 RPC's redact_notes_for_audit pattern.
--
-- Fixed error tokens raised by these functions (mapped to friendly
-- messages by lib/admin/action-result.ts):
--   insufficient_privilege, invalid_input,
--   missing_scenario, scenario_archived.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table public.launch_planning_scenarios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  assumptions jsonb not null,
  is_current boolean not null default false,
  archived_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint launch_planning_scenarios_name_length check (
    char_length(btrim(name)) between 1 and 120
  ),
  constraint launch_planning_scenarios_description_length check (
    description is null or char_length(description) <= 1000
  ),
  constraint launch_planning_scenarios_assumptions_object check (
    jsonb_typeof(assumptions) = 'object'
  )
);

comment on table public.launch_planning_scenarios is
  'LP.2 admin-only roster of named launch-planning scenarios (e.g. Conservative / Expected / Stretch). Each scenario stores a snapshot of forecast assumptions. At most one is_current scenario among non-archived rows. Writes only via SECURITY DEFINER RPCs.';
comment on column public.launch_planning_scenarios.assumptions is
  'JSONB document mirroring LP.1 assumption shape. The notes field is admin-only and is NEVER written to audit_events metadata.';
comment on column public.launch_planning_scenarios.is_current is
  'Marks the canonical scenario shown by default. Only one non-archived scenario may have is_current = true.';
comment on column public.launch_planning_scenarios.archived_at is
  'Soft-archive timestamp. Archived scenarios are excluded from the active list and the is_current partial unique index.';

create index idx_launch_planning_scenarios_active
  on public.launch_planning_scenarios (archived_at, name);

-- Partial unique: at most one current scenario among non-archived rows.
-- Archived rows are excluded so an old "current" scenario doesn't block
-- assigning the flag to a fresh scenario after archive.
create unique index launch_planning_scenarios_one_current
  on public.launch_planning_scenarios (is_current)
  where is_current = true and archived_at is null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.launch_planning_scenarios enable row level security;

create policy launch_planning_scenarios_admin_select
  on public.launch_planning_scenarios
  for select to authenticated using (public.auth_is_admin());

grant select on public.launch_planning_scenarios to authenticated;

-- ---------------------------------------------------------------------------
-- Helper: validate + normalize the assumptions JSON payload.
-- ---------------------------------------------------------------------------
-- Mirrors the bounds enforced by admin_update_launch_planning_assumptions
-- so the RPCs here can't accept a scenario shape the LP.1 RPC would reject.
-- Returns the normalized JSON (notes trimmed to null if blank). Raises
-- invalid_input on any out-of-bounds value.

create or replace function public.lp2_validate_scenario_assumptions(p_assumptions jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_key text;
  v_int int;
  v_num numeric;
  v_txt text;
  v_out jsonb;
begin
  if p_assumptions is null or jsonb_typeof(p_assumptions) <> 'object' then
    raise exception 'invalid_input';
  end if;

  for v_key in select key from jsonb_object_keys(p_assumptions) as t(key) loop
    if v_key not in (
      'current_church_attendance',
      'expected_growth',
      'expected_growth_date',
      'target_group_participation_pct',
      'average_group_size',
      'launch_buffer_pct',
      'leaders_per_new_group',
      'notes'
    ) then
      raise exception 'invalid_input';
    end if;
  end loop;

  -- Integer-typed fields: reject any number whose JSON serialization
  -- contains a decimal point. Casting `10.5` straight to ::int would
  -- truncate to 10 and pass bounds, but the stored row would still be
  -- 10.5 and the TS decoder (which requires an integer) would fall back
  -- to defaults. Treating the cast result as authoritative would leave
  -- a stored scenario whose math doesn't match its display.
  if p_assumptions ? 'current_church_attendance' then
    if jsonb_typeof(p_assumptions -> 'current_church_attendance') <> 'number' then
      raise exception 'invalid_input';
    end if;
    if (p_assumptions ->> 'current_church_attendance') ~ '[.eE]' then
      raise exception 'invalid_input';
    end if;
    v_int := (p_assumptions ->> 'current_church_attendance')::int;
    if v_int < 0 or v_int > 100000 then
      raise exception 'invalid_input';
    end if;
  end if;

  if p_assumptions ? 'expected_growth' then
    if jsonb_typeof(p_assumptions -> 'expected_growth') <> 'number' then
      raise exception 'invalid_input';
    end if;
    if (p_assumptions ->> 'expected_growth') ~ '[.eE]' then
      raise exception 'invalid_input';
    end if;
    v_int := (p_assumptions ->> 'expected_growth')::int;
    if v_int < -100000 or v_int > 100000 then
      raise exception 'invalid_input';
    end if;
  end if;

  if p_assumptions ? 'expected_growth_date' then
    if jsonb_typeof(p_assumptions -> 'expected_growth_date') not in ('null','string') then
      raise exception 'invalid_input';
    end if;
    if jsonb_typeof(p_assumptions -> 'expected_growth_date') = 'string' then
      v_txt := p_assumptions ->> 'expected_growth_date';
      if v_txt !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        raise exception 'invalid_input';
      end if;
      begin
        perform v_txt::date;
      exception when others then
        raise exception 'invalid_input';
      end;
    end if;
  end if;

  if p_assumptions ? 'target_group_participation_pct' then
    if jsonb_typeof(p_assumptions -> 'target_group_participation_pct') <> 'number' then
      raise exception 'invalid_input';
    end if;
    v_num := (p_assumptions ->> 'target_group_participation_pct')::numeric;
    if v_num < 0 or v_num > 1 then
      raise exception 'invalid_input';
    end if;
  end if;

  if p_assumptions ? 'average_group_size' then
    if jsonb_typeof(p_assumptions -> 'average_group_size') <> 'number' then
      raise exception 'invalid_input';
    end if;
    if (p_assumptions ->> 'average_group_size') ~ '[.eE]' then
      raise exception 'invalid_input';
    end if;
    v_int := (p_assumptions ->> 'average_group_size')::int;
    if v_int < 1 or v_int > 500 then
      raise exception 'invalid_input';
    end if;
  end if;

  if p_assumptions ? 'launch_buffer_pct' then
    if jsonb_typeof(p_assumptions -> 'launch_buffer_pct') <> 'number' then
      raise exception 'invalid_input';
    end if;
    v_num := (p_assumptions ->> 'launch_buffer_pct')::numeric;
    if v_num < 0 or v_num > 0.95 then
      raise exception 'invalid_input';
    end if;
  end if;

  if p_assumptions ? 'leaders_per_new_group' then
    if jsonb_typeof(p_assumptions -> 'leaders_per_new_group') <> 'number' then
      raise exception 'invalid_input';
    end if;
    if (p_assumptions ->> 'leaders_per_new_group') ~ '[.eE]' then
      raise exception 'invalid_input';
    end if;
    v_int := (p_assumptions ->> 'leaders_per_new_group')::int;
    if v_int < 0 or v_int > 10 then
      raise exception 'invalid_input';
    end if;
  end if;

  -- Notes: trim whitespace; treat empty/blank as null so the stored row
  -- never contains a "notes": "  " string that would later confuse the
  -- has_notes heuristic.
  v_out := p_assumptions;
  if p_assumptions ? 'notes' then
    if jsonb_typeof(p_assumptions -> 'notes') not in ('null','string') then
      raise exception 'invalid_input';
    end if;
    if jsonb_typeof(p_assumptions -> 'notes') = 'string' then
      v_txt := btrim(p_assumptions ->> 'notes');
      if char_length(v_txt) > 2000 then
        raise exception 'invalid_input';
      end if;
      if char_length(v_txt) = 0 then
        v_out := v_out || jsonb_build_object('notes', null::text);
      else
        v_out := v_out || jsonb_build_object('notes', v_txt);
      end if;
    end if;
  end if;

  return v_out;
end;
$$;

revoke all on function public.lp2_validate_scenario_assumptions(jsonb) from public;
revoke all on function public.lp2_validate_scenario_assumptions(jsonb) from anon;
revoke all on function public.lp2_validate_scenario_assumptions(jsonb) from authenticated;
-- Internal helper only — none of the role grants execute it. The RPCs
-- below call it via SECURITY DEFINER context so they inherit owner-level
-- execute permission, which is what we want.

-- ---------------------------------------------------------------------------
-- Helper: redact notes from an assumptions JSON for audit metadata.
-- ---------------------------------------------------------------------------

create or replace function public.lp2_redact_assumptions_for_audit(p_assumptions jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_has_notes boolean;
begin
  if p_assumptions is null then
    return null;
  end if;
  v_has_notes := coalesce(
    (jsonb_typeof(p_assumptions -> 'notes') = 'string'
       and char_length(coalesce(p_assumptions ->> 'notes', '')) > 0),
    false
  );
  return (p_assumptions - 'notes') || jsonb_build_object('has_notes', v_has_notes);
end;
$$;

revoke all on function public.lp2_redact_assumptions_for_audit(jsonb) from public;
revoke all on function public.lp2_redact_assumptions_for_audit(jsonb) from anon;
revoke all on function public.lp2_redact_assumptions_for_audit(jsonb) from authenticated;

-- ---------------------------------------------------------------------------
-- 1. admin_create_launch_planning_scenario
-- ---------------------------------------------------------------------------
create or replace function public.admin_create_launch_planning_scenario(
  p_name text,
  p_description text,
  p_assumptions jsonb,
  p_make_current boolean
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
  v_assumptions jsonb;
  v_make_current boolean;
  v_new_id uuid;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  v_name := nullif(btrim(coalesce(p_name, '')), '');
  if v_name is null or char_length(v_name) > 120 then
    raise exception 'invalid_input';
  end if;

  v_description := nullif(btrim(coalesce(p_description, '')), '');
  if v_description is not null and char_length(v_description) > 1000 then
    raise exception 'invalid_input';
  end if;

  v_assumptions := public.lp2_validate_scenario_assumptions(p_assumptions);
  v_make_current := coalesce(p_make_current, false);

  -- If the caller asked to make this scenario current, unset the flag on
  -- the existing current scenario(s) in the same transaction. The partial
  -- unique index would reject the insert otherwise.
  if v_make_current then
    update public.launch_planning_scenarios
       set is_current = false,
           updated_at = now(),
           updated_by = v_actor
     where is_current = true
       and archived_at is null;
  end if;

  insert into public.launch_planning_scenarios (
    name, description, assumptions, is_current,
    created_by, updated_by
  ) values (
    v_name, v_description, v_assumptions, v_make_current,
    v_actor, v_actor
  )
  returning id into v_new_id;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.create_launch_planning_scenario',
    'launch_planning_scenarios',
    v_new_id,
    jsonb_build_object(
      'after', jsonb_build_object(
        'name', v_name,
        'has_description', v_description is not null,
        'is_current', v_make_current,
        'assumptions', public.lp2_redact_assumptions_for_audit(v_assumptions)
      )
    )
  );

  return v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. admin_update_launch_planning_scenario
-- ---------------------------------------------------------------------------
create or replace function public.admin_update_launch_planning_scenario(
  p_scenario_id uuid,
  p_name text,
  p_description text,
  p_assumptions jsonb,
  p_make_current boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_existing record;
  v_name text;
  v_description text;
  v_assumptions jsonb;
  v_make_current boolean;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_scenario_id is null then
    raise exception 'invalid_input';
  end if;

  v_name := nullif(btrim(coalesce(p_name, '')), '');
  if v_name is null or char_length(v_name) > 120 then
    raise exception 'invalid_input';
  end if;

  v_description := nullif(btrim(coalesce(p_description, '')), '');
  if v_description is not null and char_length(v_description) > 1000 then
    raise exception 'invalid_input';
  end if;

  v_assumptions := public.lp2_validate_scenario_assumptions(p_assumptions);
  v_make_current := coalesce(p_make_current, false);

  select id, name, description, assumptions, is_current, archived_at
    into v_existing
    from public.launch_planning_scenarios
   where id = p_scenario_id
   for update;
  if v_existing.id is null then
    raise exception 'missing_scenario';
  end if;
  if v_existing.archived_at is not null then
    raise exception 'scenario_archived';
  end if;

  -- If switching is_current ON for this scenario, unset the current flag
  -- on any other non-archived scenario that has it set.
  if v_make_current then
    update public.launch_planning_scenarios
       set is_current = false,
           updated_at = now(),
           updated_by = v_actor
     where id <> p_scenario_id
       and is_current = true
       and archived_at is null;
  end if;

  update public.launch_planning_scenarios
     set name = v_name,
         description = v_description,
         assumptions = v_assumptions,
         is_current = v_make_current,
         updated_by = v_actor,
         updated_at = now()
   where id = p_scenario_id;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.update_launch_planning_scenario',
    'launch_planning_scenarios',
    p_scenario_id,
    jsonb_build_object(
      'before', jsonb_build_object(
        'name', v_existing.name,
        'has_description', v_existing.description is not null,
        'is_current', v_existing.is_current,
        'assumptions', public.lp2_redact_assumptions_for_audit(v_existing.assumptions)
      ),
      'after', jsonb_build_object(
        'name', v_name,
        'has_description', v_description is not null,
        'is_current', v_make_current,
        'assumptions', public.lp2_redact_assumptions_for_audit(v_assumptions)
      )
    )
  );

  return p_scenario_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. admin_archive_launch_planning_scenario
-- ---------------------------------------------------------------------------
create or replace function public.admin_archive_launch_planning_scenario(
  p_scenario_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_existing record;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_scenario_id is null then
    raise exception 'invalid_input';
  end if;

  select id, name, is_current, archived_at
    into v_existing
    from public.launch_planning_scenarios
   where id = p_scenario_id
   for update;
  if v_existing.id is null then
    raise exception 'missing_scenario';
  end if;
  if v_existing.archived_at is not null then
    raise exception 'scenario_archived';
  end if;

  -- Clearing is_current when archiving keeps the partial unique index
  -- happy and matches the product rule "archived scenarios are not
  -- canonical".
  update public.launch_planning_scenarios
     set archived_at = now(),
         is_current = false,
         updated_by = v_actor,
         updated_at = now()
   where id = p_scenario_id;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.archive_launch_planning_scenario',
    'launch_planning_scenarios',
    p_scenario_id,
    jsonb_build_object(
      'before', jsonb_build_object(
        'name', v_existing.name,
        'is_current', v_existing.is_current
      ),
      'after', jsonb_build_object(
        'name', v_existing.name,
        'is_current', false,
        'archived', true
      )
    )
  );

  return p_scenario_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. admin_set_current_launch_planning_scenario
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_current_launch_planning_scenario(
  p_scenario_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_existing record;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_scenario_id is null then
    raise exception 'invalid_input';
  end if;

  select id, name, is_current, archived_at
    into v_existing
    from public.launch_planning_scenarios
   where id = p_scenario_id
   for update;
  if v_existing.id is null then
    raise exception 'missing_scenario';
  end if;
  if v_existing.archived_at is not null then
    raise exception 'scenario_archived';
  end if;

  -- Clear current on the other non-archived rows first so the partial
  -- unique index doesn't reject the update below.
  update public.launch_planning_scenarios
     set is_current = false,
         updated_at = now(),
         updated_by = v_actor
   where id <> p_scenario_id
     and is_current = true
     and archived_at is null;

  update public.launch_planning_scenarios
     set is_current = true,
         updated_by = v_actor,
         updated_at = now()
   where id = p_scenario_id;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.set_current_launch_planning_scenario',
    'launch_planning_scenarios',
    p_scenario_id,
    jsonb_build_object(
      'before', jsonb_build_object(
        'name', v_existing.name,
        'is_current', v_existing.is_current
      ),
      'after', jsonb_build_object(
        'name', v_existing.name,
        'is_current', true
      )
    )
  );

  return p_scenario_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Revoke from public/anon/authenticated, then grant execute to
-- authenticated. Bodies still enforce auth_is_admin().
-- ---------------------------------------------------------------------------

revoke all on function public.admin_create_launch_planning_scenario(text, text, jsonb, boolean) from public;
revoke all on function public.admin_create_launch_planning_scenario(text, text, jsonb, boolean) from anon;
revoke all on function public.admin_create_launch_planning_scenario(text, text, jsonb, boolean) from authenticated;
grant execute on function public.admin_create_launch_planning_scenario(text, text, jsonb, boolean) to authenticated;

revoke all on function public.admin_update_launch_planning_scenario(uuid, text, text, jsonb, boolean) from public;
revoke all on function public.admin_update_launch_planning_scenario(uuid, text, text, jsonb, boolean) from anon;
revoke all on function public.admin_update_launch_planning_scenario(uuid, text, text, jsonb, boolean) from authenticated;
grant execute on function public.admin_update_launch_planning_scenario(uuid, text, text, jsonb, boolean) to authenticated;

revoke all on function public.admin_archive_launch_planning_scenario(uuid) from public;
revoke all on function public.admin_archive_launch_planning_scenario(uuid) from anon;
revoke all on function public.admin_archive_launch_planning_scenario(uuid) from authenticated;
grant execute on function public.admin_archive_launch_planning_scenario(uuid) to authenticated;

revoke all on function public.admin_set_current_launch_planning_scenario(uuid) from public;
revoke all on function public.admin_set_current_launch_planning_scenario(uuid) from anon;
revoke all on function public.admin_set_current_launch_planning_scenario(uuid) from authenticated;
grant execute on function public.admin_set_current_launch_planning_scenario(uuid) to authenticated;

comment on function public.admin_create_launch_planning_scenario(text, text, jsonb, boolean) is
  'LP.2 admin write: inserts a launch_planning_scenarios row plus an audit_events row. Notes body is NOT stored in audit metadata.';
comment on function public.admin_update_launch_planning_scenario(uuid, text, text, jsonb, boolean) is
  'LP.2 admin write: updates a launch_planning_scenarios row plus an audit_events row with before/after snapshots. Rejects archived scenarios. Notes body is NOT stored in audit metadata.';
comment on function public.admin_archive_launch_planning_scenario(uuid) is
  'LP.2 admin write: soft-archives a scenario (sets archived_at), clears is_current if set, and writes an audit_events row.';
comment on function public.admin_set_current_launch_planning_scenario(uuid) is
  'LP.2 admin write: marks the named scenario current and clears the flag on any other non-archived scenario. Rejects archived scenarios.';
