-- ===========================================================================
-- #747: idempotently add one free-text type to the canonical group_types list.
--
-- The Interest Funnel's Prospect form (and, later, the card's Edit details) lets
-- Julian append a missing Group type inline. Rather than a client-side
-- read-modify-write against the whole-list `admin_set_group_types` replace —
-- which races two concurrent appends and re-audits the entire list — this is a
-- small, idempotent append: it adds the one name if absent (case-insensitively),
-- no-ops if present, preserves existing entries/order, and writes its own paired
-- audit_events row. Mirrors the validation rules and storage shape of
-- admin_set_group_types (app_settings keyed row, `{ types: jsonb_array }`).
-- ===========================================================================

create function public.admin_add_group_type(p_group_type text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor  uuid;
  v_row_id uuid;
  v_type   text;
  v_before jsonb;
  v_types  jsonb;
  v_after  jsonb;
  v_exists boolean;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  -- Same rules as the group-type list validator: trim, non-blank, ≤80 chars.
  v_type := nullif(btrim(coalesce(p_group_type, '')), '');
  if v_type is null or char_length(v_type) > 80 then
    raise exception 'invalid_input';
  end if;

  -- Serialize concurrent appends of the same name so two callers can't both
  -- read it as absent and double-insert — the append stays idempotent under
  -- races. Keyed on the lowercased name (case-insensitive identity).
  perform pg_advisory_xact_lock(
    hashtext('app_settings:group_types'),
    hashtext(lower(v_type))
  );

  select id, setting_value into v_row_id, v_before
    from public.app_settings
   where setting_key = 'group_types'
   for update;

  if v_row_id is null then
    -- No list yet: create it seeded with this one type.
    v_types := jsonb_build_array(to_jsonb(v_type));
    insert into public.app_settings (setting_key, setting_value)
    values ('group_types', jsonb_build_object('types', v_types))
    returning id, '{}'::jsonb into v_row_id, v_before;
  else
    v_types := coalesce(v_before -> 'types', '[]'::jsonb);
    -- Case-insensitive existence check; a present name is a no-op (no duplicate,
    -- existing order preserved).
    select exists (
      select 1
        from jsonb_array_elements_text(v_types) as existing(name)
       where lower(existing.name) = lower(v_type)
    ) into v_exists;
    if not v_exists then
      v_types := v_types || to_jsonb(v_type);
      update public.app_settings
         set setting_value = jsonb_build_object('types', v_types)
       where id = v_row_id;
    end if;
  end if;

  v_after := jsonb_build_object('types', v_types);

  -- Paired audit row. The type name is a catalog label (not PII); record it plus
  -- before/after so a no-op (before == after) is distinguishable from an append.
  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.add_group_type',
    'app_settings',
    v_row_id,
    jsonb_build_object('before', v_before, 'after', v_after, 'added', v_type)
  );

  return v_row_id;
end;
$$;

revoke all on function public.admin_add_group_type(text) from public, anon, authenticated;
grant execute on function public.admin_add_group_type(text) to authenticated;

comment on function public.admin_add_group_type(text) is
  'Admin write: idempotently appends one free-text type to app_settings.group_types (trimmed, ≤80 chars, case-insensitive no-op if present, order preserved). Writes a paired audit_events row.';
