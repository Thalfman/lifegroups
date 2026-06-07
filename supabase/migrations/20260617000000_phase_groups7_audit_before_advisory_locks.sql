-- Audit `before` advisory locks for the bare pre-read+upsert admin RPCs (#415 / ADR 0022).
--
-- Concern #2 of #415: an admin jsonb-write RPC that snapshots the prior value with
-- SELECT ... FOR UPDATE and then upserts via ON CONFLICT DO UPDATE has a first-insert
-- race. For a brand-new key, FOR UPDATE locks nothing (no row yet), so two concurrent
-- writers both pre-read NULL and the ON CONFLICT loser overwrites the winner while
-- auditing `before: null`. admin_set_audience_readiness_rule (#414) already closed this
-- with a per-key pg_advisory_xact_lock taken before the snapshot.
--
-- ADR 0022 records the family-wide invariant: any such RPC must serialize concurrent
-- same-key writers BEFORE the snapshot. A review of the pre-read+upsert family found
-- only the FOUR functions below lack that serialization — they lock only their own
-- conflict row, which may not exist yet. The other pre-read+upsert siblings already
-- satisfy the invariant incidentally (a parent-row FOR UPDATE on groups / group_categories
-- / profiles keyed by the conflict identity, or an INSERT ... ON CONFLICT DO NOTHING
-- pre-create), so they are intentionally left unchanged — see ADR 0022 for the per-sibling
-- record. This migration brings the four bare RPCs up to the exemplar.
--
-- Each function is recreated verbatim via CREATE OR REPLACE with ONLY the advisory lock
-- added before its snapshot read. CREATE OR REPLACE preserves the existing EXECUTE
-- privileges (the revoke-from-public/anon/authenticated + grant-to-authenticated lockdown)
-- and the COMMENT, so neither is re-emitted; the SECURITY DEFINER + pinned search_path,
-- the top-level jsonb_typeof re-guards, the conflict targets, and the paired audit_events
-- rows are unchanged. No shipped migration file is edited.

-- ---------------------------------------------------------------------------
-- admin_set_readiness_rule — upsert on (ministry_year); no parent FK to serialize on.
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_readiness_rule(
  p_ministry_year integer,
  p_rule          jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor  uuid;
  v_before jsonb;
  v_id     uuid;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_ministry_year is null or p_ministry_year < 2000 or p_ministry_year > 3000 then
    raise exception 'invalid_input';
  end if;

  -- The RPC is the DB trust boundary (execute is granted to any authenticated
  -- admin): re-guard the jsonb payload's top-level shape here, mirroring the TS
  -- validator, so a direct caller can't persist a malformed rule that later
  -- corrupts readiness evaluation. The rule must be an object.
  if p_rule is null or jsonb_typeof(p_rule) <> 'object' then
    raise exception 'invalid_input';
  end if;

  -- Serialize concurrent writers to THIS (ministry_year) key BEFORE the snapshot read,
  -- so the audited `before` always reflects the row actually overwritten. Two
  -- admins racing the FIRST insert for a brand-new key would otherwise both
  -- pre-read NULL (a SELECT ... FOR UPDATE locks nothing when no row exists yet),
  -- and the ON CONFLICT loser would overwrite the winner while auditing
  -- `before: null`. This RPC locks only its own conflict row (it has no parent FK
  -- row to serialize on), so it takes a per-key advisory xact lock — the same fix
  -- shipped for admin_set_audience_readiness_rule (#414). See ADR 0022 (#415).
  -- The two int4 keys namespace the lock to this table + key.
  perform pg_advisory_xact_lock(
    hashtext('multiplication_readiness_rule'),
    hashtext(p_ministry_year::text)
  );

  -- Snapshot the prior rule (if any) for the audit before/after pair.
  select rule into v_before
    from public.multiplication_readiness_rule
   where ministry_year = p_ministry_year
   for update;

  insert into public.multiplication_readiness_rule (
    ministry_year, rule, created_by, updated_by
  )
  values (p_ministry_year, p_rule, v_actor, v_actor)
  on conflict (ministry_year) do update
     set rule       = excluded.rule,
         updated_by = v_actor
  returning id into v_id;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.set_readiness_rule',
    'multiplication_readiness_rule',
    v_id,
    jsonb_build_object(
      'ministry_year', p_ministry_year,
      'before', v_before,
      'after', p_rule
    )
  );

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_set_health_rubric — upsert on (kind); no parent FK to serialize on.
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_health_rubric(
  p_kind     text,
  p_criteria jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_kind  public.health_rubric_kind;
  v_before jsonb;
  v_id uuid;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_kind is null or p_kind not in ('group','leader') then
    raise exception 'invalid_input';
  end if;
  v_kind := p_kind::public.health_rubric_kind;

  if p_criteria is null or jsonb_typeof(p_criteria) <> 'array' then
    raise exception 'invalid_input';
  end if;

  -- The RPC is the DB trust boundary (execute is granted to any authenticated
  -- admin): re-validate the rubric shape + weight total here, mirroring
  -- validateRubric / RUBRIC_WEIGHT_TOTAL, so a direct caller can't persist a
  -- malformed rubric that later corrupts grade computation. Each criterion must
  -- be an object with a non-empty text key + label and a numeric weight in
  -- [0,100]; keys must be unique; the weights must total exactly 100.
  declare
    v_elem  jsonb;
    v_keys  text[] := array[]::text[];
    v_key   text;
    v_total numeric := 0;
  begin
    if jsonb_array_length(p_criteria) = 0 then
      raise exception 'invalid_input';
    end if;
    for v_elem in select * from jsonb_array_elements(p_criteria) loop
      if jsonb_typeof(v_elem) <> 'object' then
        raise exception 'invalid_input';
      end if;
      if jsonb_typeof(v_elem -> 'key') <> 'string'
         or btrim(coalesce(v_elem ->> 'key', '')) = '' then
        raise exception 'invalid_input';
      end if;
      if jsonb_typeof(v_elem -> 'label') <> 'string'
         or btrim(coalesce(v_elem ->> 'label', '')) = '' then
        raise exception 'invalid_input';
      end if;
      if jsonb_typeof(v_elem -> 'weight') <> 'number' then
        raise exception 'invalid_input';
      end if;
      if (v_elem ->> 'weight')::numeric < 0
         or (v_elem ->> 'weight')::numeric > 100 then
        raise exception 'invalid_input';
      end if;
      v_key := btrim(v_elem ->> 'key');
      if v_key = any (v_keys) then
        raise exception 'invalid_input';
      end if;
      v_keys  := v_keys || v_key;
      v_total := v_total + (v_elem ->> 'weight')::numeric;
    end loop;
    if v_total <> 100 then
      raise exception 'invalid_input';
    end if;
  end;

  -- Serialize concurrent writers to THIS (kind) key BEFORE the snapshot read,
  -- so the audited `before` always reflects the row actually overwritten. Two
  -- admins racing the FIRST insert for a brand-new key would otherwise both
  -- pre-read NULL (a SELECT ... FOR UPDATE locks nothing when no row exists yet),
  -- and the ON CONFLICT loser would overwrite the winner while auditing
  -- `before: null`. This RPC locks only its own conflict row (it has no parent FK
  -- row to serialize on), so it takes a per-key advisory xact lock — the same fix
  -- shipped for admin_set_audience_readiness_rule (#414). See ADR 0022 (#415).
  -- The two int4 keys namespace the lock to this table + key.
  perform pg_advisory_xact_lock(
    hashtext('health_rubrics'),
    hashtext(p_kind)
  );

  -- Snapshot the prior rubric (if any) for the audit before/after pair.
  select criteria into v_before
    from public.health_rubrics
   where kind = v_kind
   for update;

  insert into public.health_rubrics (kind, criteria, created_by, updated_by)
  values (v_kind, p_criteria, v_actor, v_actor)
  on conflict (kind) do update
     set criteria   = excluded.criteria,
         updated_by = v_actor
  returning id into v_id;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.set_health_rubric',
    'health_rubrics',
    v_id,
    jsonb_build_object(
      'kind', p_kind,
      'before', v_before,
      'after', p_criteria
    )
  );

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_set_multiplication_config — upsert on (group_type, ministry_year); no parent FK to serialize on.
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_multiplication_config(
  p_group_type    text,
  p_ministry_year integer,
  p_thresholds    jsonb,
  p_trigger       jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor  uuid;
  v_before jsonb;
  v_id     uuid;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  -- Validate the group type + ministry year. The type mirrors the
  -- GroupAudienceCategory ('men','women','mixed'); the year is a plain integer.
  if p_group_type is null or p_group_type not in ('men','women','mixed') then
    raise exception 'invalid_input';
  end if;
  if p_ministry_year is null or p_ministry_year < 2000 or p_ministry_year > 3000 then
    raise exception 'invalid_input';
  end if;

  -- The RPC is the DB trust boundary (execute is granted to any authenticated
  -- admin): re-guard each jsonb payload's top-level shape here, mirroring the TS
  -- validators, so a direct caller can't persist a malformed config that later
  -- corrupts pillar computation. Each jsonb arg must be an object. The old fed
  -- capacity argument is gone (#401): capacity is a derived per-cell issue.
  if p_thresholds is null or jsonb_typeof(p_thresholds) <> 'object' then
    raise exception 'invalid_input';
  end if;
  if p_trigger is null or jsonb_typeof(p_trigger) <> 'object' then
    raise exception 'invalid_input';
  end if;

  -- Serialize concurrent writers to THIS (group_type, ministry_year) key BEFORE the snapshot read,
  -- so the audited `before` always reflects the row actually overwritten. Two
  -- admins racing the FIRST insert for a brand-new key would otherwise both
  -- pre-read NULL (a SELECT ... FOR UPDATE locks nothing when no row exists yet),
  -- and the ON CONFLICT loser would overwrite the winner while auditing
  -- `before: null`. This RPC locks only its own conflict row (it has no parent FK
  -- row to serialize on), so it takes a per-key advisory xact lock — the same fix
  -- shipped for admin_set_audience_readiness_rule (#414). See ADR 0022 (#415).
  -- The two int4 keys namespace the lock to this table + key.
  perform pg_advisory_xact_lock(
    hashtext('multiplication_config'),
    hashtext(p_group_type || ':' || p_ministry_year::text)
  );

  -- Snapshot the prior config (if any) for the audit before/after pair.
  select jsonb_build_object(
           'thresholds', thresholds,
           'trigger_rubric', trigger_rubric
         )
    into v_before
    from public.multiplication_config
   where group_type = p_group_type and ministry_year = p_ministry_year
   for update;

  insert into public.multiplication_config (
    group_type, ministry_year, thresholds, trigger_rubric,
    created_by, updated_by
  )
  values (
    p_group_type, p_ministry_year, p_thresholds, p_trigger,
    v_actor, v_actor
  )
  on conflict (group_type, ministry_year) do update
     set thresholds     = excluded.thresholds,
         trigger_rubric = excluded.trigger_rubric,
         updated_by     = v_actor
  returning id into v_id;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.set_multiplication_config',
    'multiplication_config',
    v_id,
    jsonb_build_object(
      'group_type', p_group_type,
      'ministry_year', p_ministry_year,
      'before', v_before,
      'after', jsonb_build_object(
        'thresholds', p_thresholds,
        'trigger_rubric', p_trigger
      )
    )
  );

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_record_church_attendance_snapshot — upsert on (snapshot_date); no parent FK to serialize on.
-- ---------------------------------------------------------------------------
create or replace function public.admin_record_church_attendance_snapshot(
  p_snapshot_date    date,
  p_attendance_count integer,
  p_note             text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_note text;
  v_row_id uuid;
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

  if p_snapshot_date is null then
    raise exception 'invalid_input';
  end if;
  if p_attendance_count is null
     or p_attendance_count < 0 or p_attendance_count > 1000000 then
    raise exception 'invalid_input';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'invalid_input';
  end if;

  -- Serialize concurrent writers to THIS (snapshot_date) key BEFORE the snapshot read,
  -- so the audited `before` always reflects the row actually overwritten. Two
  -- admins racing the FIRST insert for a brand-new key would otherwise both
  -- pre-read NULL (a SELECT ... FOR UPDATE locks nothing when no row exists yet),
  -- and the ON CONFLICT loser would overwrite the winner while auditing
  -- `before: null`. This RPC locks only its own conflict row (it has no parent FK
  -- row to serialize on), so it takes a per-key advisory xact lock — the same fix
  -- shipped for admin_set_audience_readiness_rule (#414). See ADR 0022 (#415).
  -- The two int4 keys namespace the lock to this table + key.
  perform pg_advisory_xact_lock(
    hashtext('church_attendance_snapshots'),
    hashtext(p_snapshot_date::text)
  );

  -- Snapshot the prior snapshot (if any) for the audit before/after pair.
  select id,
         jsonb_build_object(
           'snapshot_date', snapshot_date,
           'attendance_count', attendance_count,
           'note', note
         )
    into v_row_id, v_before
    from public.church_attendance_snapshots
   where snapshot_date = p_snapshot_date
   for update;

  insert into public.church_attendance_snapshots (
    snapshot_date, attendance_count, note, created_by_profile_id
  )
  values (p_snapshot_date, p_attendance_count, v_note, v_actor)
  on conflict (snapshot_date) do update
    set attendance_count = excluded.attendance_count,
        note             = excluded.note
  returning id into v_row_id;

  v_after := jsonb_build_object(
    'snapshot_date', p_snapshot_date,
    'attendance_count', p_attendance_count,
    'note', v_note
  );

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.record_church_attendance_snapshot',
    'church_attendance_snapshots',
    v_row_id,
    jsonb_build_object(
      'before', coalesce(v_before, jsonb_build_object()),
      'after',  v_after
    )
  );

  return v_row_id;
end;
$$;

