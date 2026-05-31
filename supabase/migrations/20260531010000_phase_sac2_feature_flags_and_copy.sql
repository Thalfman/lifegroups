-- Phase SAC.2 (#161 + #162) Super Admin Console feature flags + editable copy.
--
-- Extends super_admin_set_platform_config (SAC.1) to whitelist two more config
-- blocks in addition to the existing console_tracer_note (which keeps working):
--   - feature_flags: a jsonb object whose values are objects with a boolean
--     `enabled` and an optional boolean `verified`.
--   - editable_copy: a jsonb object whose values are strings (<= 200 chars).
--
-- Both blocks DEEP-MERGE into the stored row's matching sub-object so toggling
-- one flag / one copy key never clobbers the others. The store is the SAC.1
-- keyed-row platform_config table (setting_key = 'platform_config',
-- setting_value jsonb), Super-Admin-only via RLS. Malformed input raises
-- invalid_input. The paired audit_events row records only the submitted
-- top-level keys (redacted: no values), matching the SAC.1 pattern.
--
-- SECURITY DEFINER behind the auth_role() = 'super_admin' gate; no service-role
-- writes. This single migration serves both #161 and #162.

set check_function_bodies = off;

create or replace function public.super_admin_set_platform_config(
  p_config jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor  uuid;
  v_row_id uuid;
  v_before jsonb;
  v_merged jsonb;
  v_note   text;
  v_flags  jsonb;
  v_copy   jsonb;
  v_key    text;
  v_val    jsonb;
begin
  if public.auth_role() <> 'super_admin' then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_config is null or jsonb_typeof(p_config) <> 'object' then
    raise exception 'invalid_input';
  end if;

  -- Whitelist + per-key validation. Unknown top-level keys are ignored so a
  -- future schema addition cannot corrupt the stored row by accident.
  if p_config ? 'console_tracer_note' then
    if jsonb_typeof(p_config -> 'console_tracer_note') <> 'string' then
      raise exception 'invalid_input';
    end if;
    v_note := p_config ->> 'console_tracer_note';
    if char_length(v_note) > 200 then
      raise exception 'invalid_input';
    end if;
  end if;

  if p_config ? 'feature_flags' then
    v_flags := p_config -> 'feature_flags';
    if jsonb_typeof(v_flags) <> 'object' then
      raise exception 'invalid_input';
    end if;
    for v_key, v_val in select * from jsonb_each(v_flags) loop
      if jsonb_typeof(v_val) <> 'object' then
        raise exception 'invalid_input';
      end if;
      if jsonb_typeof(v_val -> 'enabled') <> 'boolean' then
        raise exception 'invalid_input';
      end if;
      if (v_val ? 'verified')
         and jsonb_typeof(v_val -> 'verified') <> 'boolean' then
        raise exception 'invalid_input';
      end if;
    end loop;
  end if;

  if p_config ? 'editable_copy' then
    v_copy := p_config -> 'editable_copy';
    if jsonb_typeof(v_copy) <> 'object' then
      raise exception 'invalid_input';
    end if;
    for v_key, v_val in select * from jsonb_each(v_copy) loop
      if jsonb_typeof(v_val) <> 'string' then
        raise exception 'invalid_input';
      end if;
      if char_length(v_copy ->> v_key) > 200 then
        raise exception 'invalid_input';
      end if;
    end loop;
  end if;

  select id, setting_value into v_row_id, v_before
    from public.platform_config
   where setting_key = 'platform_config'
   for update;

  if v_row_id is null then
    raise exception 'missing_settings';
  end if;

  -- Merge submitted whitelisted keys onto the stored row. Scalars replace;
  -- feature_flags / editable_copy DEEP-MERGE their submitted sub-keys onto the
  -- existing sub-object so an unrelated flag / copy key is never clobbered.
  v_merged := v_before;
  if p_config ? 'console_tracer_note' then
    v_merged := v_merged
      || jsonb_build_object('console_tracer_note', p_config -> 'console_tracer_note');
  end if;
  if p_config ? 'feature_flags' then
    v_merged := v_merged || jsonb_build_object(
      'feature_flags',
      coalesce(v_merged -> 'feature_flags', '{}'::jsonb) || v_flags
    );
  end if;
  if p_config ? 'editable_copy' then
    v_merged := v_merged || jsonb_build_object(
      'editable_copy',
      coalesce(v_merged -> 'editable_copy', '{}'::jsonb) || v_copy
    );
  end if;

  update public.platform_config
     set setting_value = v_merged
   where id = v_row_id;

  -- Audit WITHOUT the raw values (platform_config is Super-Admin-only but
  -- audit_events is admin-readable); record only the submitted key names.
  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'super_admin.set_platform_config',
    'platform_config',
    v_row_id,
    jsonb_build_object(
      'submitted_keys', (select jsonb_agg(k) from jsonb_object_keys(p_config) k)
    )
  );

  return v_row_id;
end;
$$;

revoke all     on function public.super_admin_set_platform_config(jsonb) from public;
revoke all     on function public.super_admin_set_platform_config(jsonb) from anon;
revoke all     on function public.super_admin_set_platform_config(jsonb) from authenticated;
grant  execute on function public.super_admin_set_platform_config(jsonb) to authenticated;

comment on function public.super_admin_set_platform_config(jsonb) is
  'Phase SAC.2 (#161/#162): super-admin write that deep-merges console_tracer_note, feature_flags, and editable_copy into platform_config with a paired audit_events row. Super-admin gate only.';
