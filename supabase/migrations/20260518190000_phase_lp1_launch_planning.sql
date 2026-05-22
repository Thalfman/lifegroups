-- LP.1 — Capacity & Launch Planning MVP
--
-- Adds:
--   * One seeded app_settings row keyed 'launch_planning_assumptions'
--     holding Julian's editable forecast assumptions as a JSONB document.
--   * One narrow SECURITY DEFINER RPC:
--       - admin_update_launch_planning_assumptions(p_settings jsonb)
--     The RPC verifies the actor is an active super_admin or
--     ministry_admin (via auth_is_admin()), validates submitted keys in
--     PL/pgSQL, merges into the stored row, and writes a paired
--     audit_events row in the same transaction.
--
-- Privacy note: the assumptions JSON includes a free-text `notes` field.
-- That string is admin-only and MUST NOT appear in audit metadata. The
-- audit row instead records a `has_notes` boolean derived from the row.
-- Numeric assumption values appear in audit metadata for history.

-- ===========================================================================
-- 1. Seed app_settings row (repair-merge — re-runs keep operator changes)
-- ===========================================================================
--
-- On first run: insert the full defaults jsonb.
-- On re-run:    only fill in keys that are missing from the stored row,
--               leaving any value an operator already changed untouched.
--               Mirror of the metric_defaults seed pattern in
--               20260518100000_phase5a4_settings_and_role.sql.

insert into public.app_settings (setting_key, setting_value)
values (
  'launch_planning_assumptions',
  jsonb_build_object(
    'current_church_attendance',       100,
    'expected_growth',                 20,
    'expected_growth_date',            null,
    'target_group_participation_pct',  0.60,
    'average_group_size',              10,
    'launch_buffer_pct',               0.15,
    'leaders_per_new_group',           2,
    'notes',                           null
  )
)
on conflict (setting_key) do update
  set setting_value = excluded.setting_value || public.app_settings.setting_value;

-- ===========================================================================
-- 2. RPC: admin_update_launch_planning_assumptions
-- ===========================================================================

create or replace function public.admin_update_launch_planning_assumptions(
  p_settings jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_before jsonb;
  v_merged jsonb;
  v_after  jsonb;
  v_row_id uuid;
  v_int    int;
  v_num    numeric;
  v_txt    text;
  v_before_redacted jsonb;
  v_after_redacted  jsonb;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception 'invalid_input';
  end if;

  -- Whitelist + per-key bounds. Unknown keys raise invalid_input so a
  -- typo in the client surfaces rather than silently dropping data
  -- (the wider settings RPC simply ignores unknown keys; here we are
  -- strict because the payload surface is small).
  for v_txt in select key from jsonb_object_keys(p_settings) as t(key) loop
    if v_txt not in (
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

  if p_settings ? 'current_church_attendance' then
    if jsonb_typeof(p_settings -> 'current_church_attendance') <> 'number' then
      raise exception 'invalid_input';
    end if;
    v_int := (p_settings ->> 'current_church_attendance')::int;
    if v_int < 0 or v_int > 100000 then
      raise exception 'invalid_input';
    end if;
  end if;

  if p_settings ? 'expected_growth' then
    if jsonb_typeof(p_settings -> 'expected_growth') <> 'number' then
      raise exception 'invalid_input';
    end if;
    v_int := (p_settings ->> 'expected_growth')::int;
    if v_int < -100000 or v_int > 100000 then
      raise exception 'invalid_input';
    end if;
  end if;

  if p_settings ? 'expected_growth_date' then
    if jsonb_typeof(p_settings -> 'expected_growth_date') not in ('null','string') then
      raise exception 'invalid_input';
    end if;
    if jsonb_typeof(p_settings -> 'expected_growth_date') = 'string' then
      v_txt := p_settings ->> 'expected_growth_date';
      -- Accept exactly YYYY-MM-DD; rely on ::date to reject impossible
      -- dates like 2026-02-30.
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

  if p_settings ? 'target_group_participation_pct' then
    if jsonb_typeof(p_settings -> 'target_group_participation_pct') <> 'number' then
      raise exception 'invalid_input';
    end if;
    v_num := (p_settings ->> 'target_group_participation_pct')::numeric;
    if v_num < 0 or v_num > 1 then
      raise exception 'invalid_input';
    end if;
  end if;

  if p_settings ? 'average_group_size' then
    if jsonb_typeof(p_settings -> 'average_group_size') <> 'number' then
      raise exception 'invalid_input';
    end if;
    v_int := (p_settings ->> 'average_group_size')::int;
    if v_int < 1 or v_int > 500 then
      raise exception 'invalid_input';
    end if;
  end if;

  if p_settings ? 'launch_buffer_pct' then
    if jsonb_typeof(p_settings -> 'launch_buffer_pct') <> 'number' then
      raise exception 'invalid_input';
    end if;
    v_num := (p_settings ->> 'launch_buffer_pct')::numeric;
    -- Strict upper bound at 0.95 so the (1 - buffer) denominator can
    -- never reach zero in computeLaunchPlan.
    if v_num < 0 or v_num > 0.95 then
      raise exception 'invalid_input';
    end if;
  end if;

  if p_settings ? 'leaders_per_new_group' then
    if jsonb_typeof(p_settings -> 'leaders_per_new_group') <> 'number' then
      raise exception 'invalid_input';
    end if;
    v_int := (p_settings ->> 'leaders_per_new_group')::int;
    if v_int < 0 or v_int > 10 then
      raise exception 'invalid_input';
    end if;
  end if;

  if p_settings ? 'notes' then
    if jsonb_typeof(p_settings -> 'notes') not in ('null','string') then
      raise exception 'invalid_input';
    end if;
    if jsonb_typeof(p_settings -> 'notes') = 'string' then
      if char_length(p_settings ->> 'notes') > 2000 then
        raise exception 'invalid_input';
      end if;
    end if;
  end if;

  select id, setting_value into v_row_id, v_before
    from public.app_settings
   where setting_key = 'launch_planning_assumptions'
   for update;

  if v_row_id is null then
    raise exception 'missing_settings';
  end if;

  -- Merge submitted keys onto the stored row. Whitelist again here so
  -- a future key added to the JSON cannot sneak in via the merge.
  v_merged := v_before;
  if p_settings ? 'current_church_attendance' then
    v_merged := v_merged || jsonb_build_object(
      'current_church_attendance', p_settings -> 'current_church_attendance'
    );
  end if;
  if p_settings ? 'expected_growth' then
    v_merged := v_merged || jsonb_build_object(
      'expected_growth', p_settings -> 'expected_growth'
    );
  end if;
  if p_settings ? 'expected_growth_date' then
    v_merged := v_merged || jsonb_build_object(
      'expected_growth_date', p_settings -> 'expected_growth_date'
    );
  end if;
  if p_settings ? 'target_group_participation_pct' then
    v_merged := v_merged || jsonb_build_object(
      'target_group_participation_pct', p_settings -> 'target_group_participation_pct'
    );
  end if;
  if p_settings ? 'average_group_size' then
    v_merged := v_merged || jsonb_build_object(
      'average_group_size', p_settings -> 'average_group_size'
    );
  end if;
  if p_settings ? 'launch_buffer_pct' then
    v_merged := v_merged || jsonb_build_object(
      'launch_buffer_pct', p_settings -> 'launch_buffer_pct'
    );
  end if;
  if p_settings ? 'leaders_per_new_group' then
    v_merged := v_merged || jsonb_build_object(
      'leaders_per_new_group', p_settings -> 'leaders_per_new_group'
    );
  end if;
  if p_settings ? 'notes' then
    v_merged := v_merged || jsonb_build_object(
      'notes', p_settings -> 'notes'
    );
  end if;

  update public.app_settings
     set setting_value = v_merged
   where id = v_row_id
   returning setting_value into v_after;

  -- Redact the notes body before writing audit metadata. Audit must
  -- never carry the freeform note string; only record whether one was
  -- present so reviewers can tell if Julian left an annotation.
  v_before_redacted := (v_before - 'notes') ||
    jsonb_build_object(
      'has_notes',
      coalesce(
        (jsonb_typeof(v_before -> 'notes') = 'string'
           and char_length(coalesce(v_before ->> 'notes','')) > 0),
        false
      )
    );
  v_after_redacted := (v_after - 'notes') ||
    jsonb_build_object(
      'has_notes',
      coalesce(
        (jsonb_typeof(v_after -> 'notes') = 'string'
           and char_length(coalesce(v_after ->> 'notes','')) > 0),
        false
      )
    );

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.update_launch_planning_assumptions',
    'app_settings',
    v_row_id,
    jsonb_build_object(
      'before', v_before_redacted,
      'after',  v_after_redacted,
      'submitted_keys',
        (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(p_settings) k)
    )
  );

  return v_row_id;
end;
$$;

revoke all on function public.admin_update_launch_planning_assumptions(jsonb) from public;
revoke all on function public.admin_update_launch_planning_assumptions(jsonb) from anon;
revoke all on function public.admin_update_launch_planning_assumptions(jsonb) from authenticated;
grant  execute on function public.admin_update_launch_planning_assumptions(jsonb) to authenticated;

comment on function public.admin_update_launch_planning_assumptions(jsonb) is
  'LP.1 admin write: merges submitted keys into app_settings.launch_planning_assumptions, validates per-key bounds, writes a paired audit_events row. Notes body is redacted from audit metadata; only has_notes appears.';
