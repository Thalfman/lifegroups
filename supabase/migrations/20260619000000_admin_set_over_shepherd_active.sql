-- Admin UX: a discoverable one-click Archive/Restore for over-shepherds.
--
-- Over-shepherds already soft-archive via admin_update_over_shepherd's p_active
-- flag (active=false + archived_at), but that path is only reachable by
-- submitting the full edit form (full_name required), so the list has no direct
-- archive control. This adds a focused toggle RPC that flips only `active`
-- (maintaining archived_at) so a list/detail "Archive"/"Restore" button can
-- call it without re-sending the whole record.
--
-- Same posture as the rest of the over-shepherd writes: SECURITY DEFINER,
-- auth_is_admin() gate, paired audit_events row, no hard delete. Notes/bodies
-- are never written to audit metadata.
--
-- Fixed error tokens: insufficient_privilege, invalid_input,
-- missing_over_shepherd.

create or replace function public.admin_set_over_shepherd_active(
  p_over_shepherd_id uuid,
  p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_existing record;
  v_archived_at timestamptz;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_over_shepherd_id is null or p_active is null then
    raise exception 'invalid_input';
  end if;

  select id, active, archived_at
    into v_existing
    from public.over_shepherds
   where id = p_over_shepherd_id
   for update;
  if v_existing.id is null then
    raise exception 'missing_over_shepherd';
  end if;

  -- Soft archive/restore: archived_at is the "when did this become inactive?"
  -- source of truth, mirroring admin_update_over_shepherd. Stamp it on archive,
  -- clear it on restore, leave it untouched on a no-op.
  if p_active and v_existing.active is not true then
    v_archived_at := null;
  elsif p_active = false and v_existing.active = true then
    v_archived_at := now();
  else
    v_archived_at := v_existing.archived_at;
  end if;

  update public.over_shepherds
     set active = p_active,
         archived_at = v_archived_at,
         updated_at = now()
   where id = p_over_shepherd_id;

  insert into public.audit_events
    (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.set_over_shepherd_active',
    'over_shepherds',
    p_over_shepherd_id,
    jsonb_build_object(
      'before', jsonb_build_object('active', v_existing.active),
      'after',  jsonb_build_object('active', p_active)
    )
  );

  return p_over_shepherd_id;
end;
$$;

revoke all on function public.admin_set_over_shepherd_active(uuid, boolean) from public;
revoke all on function public.admin_set_over_shepherd_active(uuid, boolean) from anon;
revoke all on function public.admin_set_over_shepherd_active(uuid, boolean) from authenticated;
grant execute on function public.admin_set_over_shepherd_active(uuid, boolean) to authenticated;

comment on function public.admin_set_over_shepherd_active(uuid, boolean) is
  'Admin write: flips an over_shepherd''s active flag (soft archive/restore, maintaining archived_at) without re-sending the whole record, plus a paired audit_events row. No hard delete.';
