-- ===========================================================================
-- Multiply Pipeline: the type-level `in_pipeline` intent flag (ADR 0030).
--
-- The Pipeline tab lets the Ministry Admin record the intent to launch another
-- group of a given type BEFORE any concrete existing group is the one spawning
-- it. That intent is a flag on the type's config row (group_type_configs), NOT a
-- candidate row — candidates stay always group-anchored (#738's retirement of
-- type-only candidate rows stands). Additive + defaulting, so existing rows read
-- false and no backfill is needed.
-- ===========================================================================

alter table public.group_type_configs
  add column if not exists in_pipeline boolean not null default false;

comment on column public.group_type_configs.in_pipeline is
  'ADR 0030: type-level Multiply Pipeline intent. true = admin pipelined this group type. Flipped (soft, audited — never hard-deleted) via admin_set_group_type_in_pipeline.';

-- ===========================================================================
-- RPC: admin_set_group_type_in_pipeline — set/clear one type's pipeline intent.
--   Mirrors admin_set_group_type_config (20260708000000): admin-gated, per-key
--   advisory-locked upsert keyed on the NORMALIZED type name, paired audit row.
--   Removal from the Pipeline = calling this with p_in_pipeline = false (a soft,
--   audited flag flip; the config row is never deleted).
-- ===========================================================================

create function public.admin_set_group_type_in_pipeline(
  p_group_type  text,
  p_in_pipeline boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor   uuid;
  v_type    text;
  v_flag    boolean;
  v_row_id  uuid;
  v_before  jsonb;
  v_after   jsonb;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  v_type := nullif(btrim(coalesce(p_group_type, '')), '');
  if v_type is null or char_length(v_type) > 80 then
    raise exception 'invalid_input';
  end if;

  v_flag := coalesce(p_in_pipeline, false);

  -- Serialize concurrent upserts for the SAME (normalized) type before the
  -- snapshot, so a brand-new type's racers can't both audit an empty `before`
  -- (same rationale as admin_set_group_type_config).
  perform pg_advisory_xact_lock(
    hashtext('group_type_configs'),
    hashtext(lower(v_type))
  );

  -- Match on the NORMALIZED identity (the unique index key) so a case-only
  -- variant updates the existing row rather than spawning a twin.
  select id, jsonb_build_object('in_pipeline', in_pipeline)
    into v_row_id, v_before
    from public.group_type_configs
   where lower(btrim(group_type)) = lower(v_type)
   for update;

  if v_row_id is null then
    -- No config row for this type yet (e.g. target/coverage never set): create
    -- one carrying only the intent flag; target_count defaults to 0.
    insert into public.group_type_configs (group_type, in_pipeline, created_by, updated_by)
    values (v_type, v_flag, v_actor, v_actor)
    returning id into v_row_id;
  else
    update public.group_type_configs
       set group_type  = v_type,
           in_pipeline = v_flag,
           updated_by  = v_actor
     where id = v_row_id;
  end if;

  v_after := jsonb_build_object('in_pipeline', v_flag);

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.set_group_type_in_pipeline',
    'group_type_configs',
    v_row_id,
    jsonb_build_object(
      'group_type', v_type,
      'before', coalesce(v_before, jsonb_build_object()),
      'after',  v_after
    )
  );

  return v_row_id;
end;
$$;

revoke all on function public.admin_set_group_type_in_pipeline(text, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_group_type_in_pipeline(text, boolean) to authenticated;

comment on function public.admin_set_group_type_in_pipeline(text, boolean) is
  'Admin write: sets/clears one group type''s Multiply Pipeline intent (in_pipeline) on group_type_configs, keyed on the free-text type name (upserts the row if absent). Removal is a soft, audited flag flip — never a hard delete. Writes a paired audit_events row.';
