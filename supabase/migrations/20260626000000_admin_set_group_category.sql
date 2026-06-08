-- Settings › Groups "+ Add existing group": a focused, audited write that tags an
-- existing group into a specific cell (audience × category) — and ONLY that.
--
-- The Settings group-type list lets an admin pull any active group into a
-- category. The first cut of that flow reused admin_update_group: read the whole
-- group row in the action layer, then replay every column with the cell
-- overridden. That has two defects this RPC fixes:
--
--   * Lost update — between the read and the update another admin could save the
--     group; replaying the stale name/schedule/capacity would clobber that edit.
--     This RPC updates ONLY audience_category + category_id, under a row lock, so
--     a concurrent edit to the other columns is never overwritten.
--   * Closed-group hole — the read selected by id with no closed_at filter, so a
--     stale/crafted submit could re-home a closed group. This RPC refuses a
--     closed group outright.
--
-- The live/active-cell gate matches create/update (admin_create_group /
-- admin_update_group): a non-null category must name an ACTIVE, non-archived
-- (audience × category) cell. Architecture parity with the rest of the groups
-- overhaul: SECURITY DEFINER + pinned search_path + auth_is_admin() guard +
-- auth_profile_id() actor + a paired audit row; EXECUTE locked down.

create or replace function public.admin_set_group_category(
  p_group_id uuid,
  p_audience_category public.group_audience_category,
  p_category_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_before jsonb;
  v_closed_at timestamptz;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  -- A tag always names a concrete category (you tag INTO a category, never into
  -- Uncategorized), so guard against a malformed call nulling the group's cell.
  if p_category_id is null then
    raise exception 'invalid_input';
  end if;

  -- Lock the row so a concurrent group edit serialises against this tag, and
  -- capture the cell we're about to change for the audit before/after.
  select jsonb_build_object(
           'audience_category', audience_category,
           'category_id', category_id
         ),
         closed_at
    into v_before, v_closed_at
    from public.groups
   where id = p_group_id
   for update;

  if v_before is null then
    raise exception 'missing_group';
  end if;

  -- A closed group is off the roster; the picker only offers active groups, so a
  -- closed id here is a stale/crafted submit. Refuse rather than silently
  -- re-home a closed group's cell.
  if v_closed_at is not null then
    raise exception 'group_closed';
  end if;

  -- The new cell must be an ACTIVE, live (non-archived) (audience × category) —
  -- the same applied cell the matrix exposes and create/update enforce. This
  -- blocks tagging a group into an unapplied/archived cell the picker never
  -- offers, which would corrupt the segmentation/coverage/readiness it feeds.
  if not exists (
    select 1
      from public.category_type_targets ctt
      join public.group_categories gc on gc.id = ctt.category_id
     where ctt.category_id = p_category_id
       and ctt.audience_category = p_audience_category::text
       and ctt.active
       and gc.archived_at is null
  ) then
    raise exception 'inactive_cell';
  end if;

  -- Only the cell changes — every other column is left exactly as it is, so a
  -- concurrent edit to name/schedule/capacity can't be clobbered by this write.
  update public.groups
     set audience_category = p_audience_category,
         category_id       = p_category_id
   where id = p_group_id;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.set_group_category',
    'groups',
    p_group_id,
    jsonb_build_object(
      'before', v_before,
      'after', jsonb_build_object(
        'audience_category', p_audience_category,
        'category_id', p_category_id
      )
    )
  );

  return p_group_id;
end;
$$;

revoke all on function public.admin_set_group_category(
  uuid, public.group_audience_category, uuid
) from public, anon, authenticated;
grant execute on function public.admin_set_group_category(
  uuid, public.group_audience_category, uuid
) to authenticated;

comment on function public.admin_set_group_category(
  uuid, public.group_audience_category, uuid
) is 'Settings › Groups "+ Add existing group": focused audited write that tags an existing (non-closed) group into an active (audience × category) cell — updates ONLY audience_category + category_id under a row lock, rejects closed groups + inactive/archived cells, and writes a paired audit_events row. Avoids the read-replay lost-update window of admin_update_group when only the cell changes.';
