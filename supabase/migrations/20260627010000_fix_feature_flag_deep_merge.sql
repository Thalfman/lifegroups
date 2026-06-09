-- Fix: toggling a frozen-surface feature flag silently wipes its `verified`
-- marker, so the surface can never actually enable.
--
-- super_admin_set_platform_config merges submitted feature flags with a single
-- jsonb `||`:
--     coalesce(v_merged -> 'feature_flags', '{}') || v_flags
-- jsonb `||` is a ONE-LEVEL (top-key) merge. Unrelated flags survive (good), but
-- for the toggled flag the WHOLE object is replaced. The per-flag toggle
-- (feature-flag-actions.ts) deliberately sends only `{ enabled }` — never
-- `verified` — so the merge drops any stored `verified: true`.
--
-- Frozen-surface flags (leader_surface, check_ins, guests) resolve to enabled
-- ONLY when `enabled AND verified` (resolveFlag, ADR 0009). A verify-before-flip
-- migration sets `verified: true`; the operator is then meant to flip `enabled`
-- on from the console. With the shallow merge that flip wipes `verified`, so the
-- surface stays held-off and the marker can only be restored by re-running a
-- migration — e.g. the documented leader-surface go-live step (#430) does not
-- work.
--
-- Fix: DEEP-merge each submitted flag INTO its existing object (two levels), so
-- a toggle that sends only `{ enabled }` preserves sibling sub-keys like
-- `verified`. editable_copy stays a one-level merge on purpose — its values are
-- scalars, where replace-the-key is the intended behaviour. Body is otherwise
-- the latest definition (20260531010000); only the feature_flags merge changed
-- (plus a v_ff working variable).

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
  -- Working accumulator for the two-level feature_flags deep merge.
  v_ff     jsonb;
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
  -- editable_copy one-level-merges its (scalar) sub-keys; feature_flags
  -- DEEP-merges each submitted flag INTO its existing object so an unrelated
  -- flag is never clobbered AND a toggle that sends only { enabled } never drops
  -- a sibling sub-key such as a frozen surface's `verified` marker.
  v_merged := v_before;
  if p_config ? 'console_tracer_note' then
    v_merged := v_merged
      || jsonb_build_object('console_tracer_note', p_config -> 'console_tracer_note');
  end if;
  if p_config ? 'feature_flags' then
    v_ff := coalesce(v_merged -> 'feature_flags', '{}'::jsonb);
    for v_key, v_val in select * from jsonb_each(v_flags) loop
      v_ff := v_ff || jsonb_build_object(
        v_key,
        coalesce(v_ff -> v_key, '{}'::jsonb) || v_val
      );
    end loop;
    v_merged := v_merged || jsonb_build_object('feature_flags', v_ff);
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
  'Phase SAC.1 (#159): super-admin platform-config write. Whitelists console_tracer_note / feature_flags / editable_copy, merges onto the single platform_config row (scalars replace; editable_copy one-level merge; feature_flags DEEP-merges each submitted flag into its existing object so a toggle sending only { enabled } preserves a frozen surface''s verified marker), and writes a paired super_admin.set_platform_config audit row in one transaction.';
