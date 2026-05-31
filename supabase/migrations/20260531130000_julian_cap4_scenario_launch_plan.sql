-- Capacity & Multiplication PRD — slice CAP.4 (#186): a scenario carries an
-- explicit planned launch count + target season/year (§3.4, §6-4, R10).
--
-- These are net-new scenario inputs. They live in the existing
-- launch_planning_scenarios.assumptions JSONB (no column change), so the
-- existing audited create/update scenario RPCs persist them unchanged — we only
-- need to widen lp2_validate_scenario_assumptions' key whitelist + bounds so it
-- stops rejecting them as unknown keys. The staffing-gap math itself is pure TS
-- (lib/admin/launch-planning.ts); nothing here computes it.
--
--   * planned_launch_count : integer 0..100 — "Julian plans N by August".
--   * target_launch_month  : 1 (January) or 8 (August) — his planting seasons.
--   * target_launch_year   : integer 2024..2100.
--
-- Architecture parity: this only re-creates an IMMUTABLE validation helper used
-- inside the SECURITY DEFINER scenario RPCs; no new write path, no RLS change.

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
      'notes',
      'planned_launch_count',
      'target_launch_month',
      'target_launch_year'
    ) then
      raise exception 'invalid_input';
    end if;
  end loop;

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

  -- #186: explicit launch plan. planned_launch_count is a whole number 0..100.
  if p_assumptions ? 'planned_launch_count' then
    if jsonb_typeof(p_assumptions -> 'planned_launch_count') <> 'number' then
      raise exception 'invalid_input';
    end if;
    if (p_assumptions ->> 'planned_launch_count') ~ '[.eE]' then
      raise exception 'invalid_input';
    end if;
    v_int := (p_assumptions ->> 'planned_launch_count')::int;
    if v_int < 0 or v_int > 100 then
      raise exception 'invalid_input';
    end if;
  end if;

  -- target_launch_month: null, or Julian's planting seasons (1 = Jan, 8 = Aug).
  if p_assumptions ? 'target_launch_month' then
    if jsonb_typeof(p_assumptions -> 'target_launch_month') not in ('null','number') then
      raise exception 'invalid_input';
    end if;
    if jsonb_typeof(p_assumptions -> 'target_launch_month') = 'number' then
      if (p_assumptions ->> 'target_launch_month') ~ '[.eE]' then
        raise exception 'invalid_input';
      end if;
      v_int := (p_assumptions ->> 'target_launch_month')::int;
      if v_int not in (1, 8) then
        raise exception 'invalid_input';
      end if;
    end if;
  end if;

  -- target_launch_year: null, or a year 2024..2100.
  if p_assumptions ? 'target_launch_year' then
    if jsonb_typeof(p_assumptions -> 'target_launch_year') not in ('null','number') then
      raise exception 'invalid_input';
    end if;
    if jsonb_typeof(p_assumptions -> 'target_launch_year') = 'number' then
      if (p_assumptions ->> 'target_launch_year') ~ '[.eE]' then
        raise exception 'invalid_input';
      end if;
      v_int := (p_assumptions ->> 'target_launch_year')::int;
      if v_int < 2024 or v_int > 2100 then
        raise exception 'invalid_input';
      end if;
    end if;
  end if;

  -- Notes: trim whitespace; treat empty/blank as null.
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

comment on function public.lp2_validate_scenario_assumptions(jsonb) is
  'LP.2 / #186 internal helper: validates + normalizes a launch-planning scenario assumptions JSON, including the net-new planned_launch_count / target_launch_month / target_launch_year fields. Raises invalid_input on out-of-bounds or unknown keys.';
