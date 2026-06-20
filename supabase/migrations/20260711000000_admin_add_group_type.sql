-- ===========================================================================
-- Idempotent single-type append to the canonical group_types list.
--
-- Settings > Group types already ships admin_set_group_types(jsonb), a
-- whole-list REPLACE. Intake forms (the Prospect "Desired group type" picker,
-- #747) need to add ONE new type inline without re-sending the entire list — a
-- client read-modify-write against the replace RPC would race two concurrent
-- adds (last writer wins, the other's type lost) and audit the whole list for a
-- one-name change. This RPC appends a single name idempotently (case-insensitive
-- no-op if already present), preserves existing entries + order, and audits just
-- the append. It writes the SAME app_settings 'group_types' row the replace RPC
-- owns, so both stay the single source of truth.
-- ===========================================================================

create function public.admin_add_group_type(p_group_type text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor   uuid;
  v_name    text;
  v_row_id  uuid;
  v_before  jsonb;
  v_types   jsonb;
  v_exists  boolean;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  -- Same validation rules as admin_set_group_types: trim, non-blank, ≤80 chars.
  v_name := nullif(btrim(coalesce(p_group_type, '')), '');
  if v_name is null or char_length(v_name) > 80 then
    raise exception 'invalid_input';
  end if;

  -- Serialize concurrent appends against the single group_types row (the row may
  -- not exist yet, so a row-level FOR UPDATE locks nothing for the first writer);
  -- a per-key advisory xact lock closes that race — the same pattern as
  -- admin_set_group_type_config in 20260708000000.
  perform pg_advisory_xact_lock(hashtext('group_types'), hashtext('append'));

  select id, setting_value
    into v_row_id, v_before
    from public.app_settings
   where setting_key = 'group_types'
   for update;

  if v_row_id is null then
    -- No list yet: seed it with just this name.
    v_types := jsonb_build_array(v_name);
    insert into public.app_settings (setting_key, setting_value)
    values ('group_types', jsonb_build_object('types', v_types))
    returning id, '{}'::jsonb into v_row_id, v_before;
  else
    -- Already present (case-insensitive)? No-op: return the row, write no audit,
    -- so a duplicate add neither grows the list nor floods the trail.
    select exists (
      select 1
        from jsonb_array_elements_text(coalesce(v_before -> 'types', '[]'::jsonb)) as t(name)
       where lower(btrim(name)) = lower(v_name)
    ) into v_exists;

    if v_exists then
      return v_row_id;
    end if;

    -- Append, preserving existing entries and their order.
    v_types := coalesce(v_before -> 'types', '[]'::jsonb) || to_jsonb(v_name);

    if jsonb_array_length(v_types) > 100 then
      raise exception 'invalid_input';
    end if;

    update public.app_settings
       set setting_value = jsonb_build_object('types', v_types)
     where id = v_row_id;
  end if;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.add_group_type',
    'app_settings',
    v_row_id,
    jsonb_build_object(
      'added', v_name,
      'before', coalesce(v_before, jsonb_build_object()),
      'after',  jsonb_build_object('types', v_types)
    )
  );

  return v_row_id;
end;
$$;

revoke all on function public.admin_add_group_type(text) from public, anon, authenticated;
grant execute on function public.admin_add_group_type(text) to authenticated;

comment on function public.admin_add_group_type(text) is
  'Admin write: idempotently appends one free-text group type to the app_settings group_types list (case-insensitive no-op if present, ≤80 chars, ≤100 total), preserving order. Writes a paired audit_events row only when a name is actually added.';
