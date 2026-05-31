-- Capacity & Multiplication PRD — slice CAP.3 (#185): one visible source of
-- truth for a group's target size (§6-3, R1).
--
-- effectiveCapacity() ranks group_metric_settings.capacity_override ABOVE
-- groups.capacity, so a Board edit to groups.capacity on a group that has an
-- override would be silently ignored by status + forecast math. This RPC edits
-- the *effective* target source: it writes groups.capacity AND clears any
-- capacity_override, so the displayed, edited, and computed target are the same
-- number. allow_over_capacity and exclude_from_capacity_metrics are NOT touched
-- (they are not target values).
--
-- Architecture parity: SECURITY DEFINER is the only write path, admin-only,
-- each write pairs an audit_events row; no hard deletes.

create or replace function public.admin_set_group_capacity_target(
  p_group_id uuid,
  p_target   integer
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_before_capacity integer;
  v_before_override integer;
  v_cleared_override boolean := false;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  -- A null target clears the per-group target (falls back to the ministry
  -- default); a set target is bounded like capacity_override.
  if p_target is not null and (p_target < 1 or p_target > 500) then
    raise exception 'invalid_input';
  end if;

  select capacity into v_before_capacity
    from public.groups
   where id = p_group_id
   for update;
  if not found then
    raise exception 'missing_group';
  end if;

  update public.groups
     set capacity = p_target
   where id = p_group_id;

  -- Clear any capacity_override so effectiveCapacity() resolves to the value
  -- we just wrote on groups.capacity — no silent divergence between shown,
  -- edited, and computed target. Other override fields are left intact.
  select capacity_override into v_before_override
    from public.group_metric_settings
   where group_id = p_group_id
   for update;
  if v_before_override is not null then
    update public.group_metric_settings
       set capacity_override = null
     where group_id = p_group_id;
    v_cleared_override := true;
  end if;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.set_group_capacity_target',
    'groups',
    p_group_id,
    jsonb_build_object(
      'before', jsonb_build_object(
        'capacity', v_before_capacity,
        'capacity_override', v_before_override
      ),
      'after', jsonb_build_object(
        'capacity', p_target,
        'capacity_override', null,
        'cleared_override', v_cleared_override
      )
    )
  );

  return p_group_id;
end;
$$;

revoke all on function public.admin_set_group_capacity_target(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.admin_set_group_capacity_target(uuid, integer)
  to authenticated;

comment on function public.admin_set_group_capacity_target(uuid, integer) is
  'Capacity & Multiplication #185 admin write: sets a group''s target size on groups.capacity and clears any capacity_override so the effective target has one visible source of truth. Leaves allow_over_capacity / exclude_from_capacity_metrics intact. Writes a paired audit_events row.';
