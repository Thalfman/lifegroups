-- Admin UX (PR review hardening): make the prospect cleanup-archive durable.
--
-- The cleanup archive (admin_archive_prospect, 20260619020000) sets archived =
-- true on a non-joined prospect so it leaves the board. But admin_transition_
-- prospect recomputes archived as (p_state = 'joined') on every move, so a stale
-- card or a direct call could transition an archived cleanup row to a non-joined
-- state and silently set archived back to false — resurrecting it on the board.
--
-- This re-creates admin_transition_prospect (body unchanged from
-- 20260608020000) with ONE added guard: a transition on an already-archived
-- prospect is rejected with the fixed token `prospect_archived`. Archived joined
-- rows were already un-transitionable (joined has no legal edges); this also
-- covers the cleanup-archived non-joined case. Restoring a prospect is a
-- deliberate future action, not a side effect of a move.

create or replace function public.admin_transition_prospect(
  p_prospect_id uuid,
  p_state       public.prospect_state,
  p_group_id    uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor       uuid;
  v_from        public.prospect_state;
  v_cur_grp     uuid;
  v_was_archived boolean;
  v_grp         uuid;
  v_archived    boolean;
  v_legal       boolean;
  v_lifecycle   public.group_lifecycle_status;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  select state, group_id, archived into v_from, v_cur_grp, v_was_archived
    from public.prospects
   where id = p_prospect_id
   for update;
  if v_from is null then
    raise exception 'missing_prospect';
  end if;

  -- An archived prospect has been removed from the board (cleanup) or is a
  -- terminal joined row. Moving it would silently un-archive it, so reject the
  -- transition rather than resurrect a cleaned-up record.
  if v_was_archived then
    raise exception 'prospect_archived';
  end if;

  -- A null incoming group carries forward the current one.
  v_grp := coalesce(p_group_id, v_cur_grp);

  -- Legal edges (must mirror LEGAL_TRANSITIONS in prospect-funnel.ts). A no-op
  -- (from = to) is not a transition.
  v_legal := case v_from
    when 'interested'       then p_state in ('matched','not_at_this_time')
    when 'matched'          then p_state in ('joined','interested','not_at_this_time')
    when 'joined'           then false
    when 'not_at_this_time' then p_state in ('interested')
    else false
  end;
  if not v_legal then
    raise exception 'illegal_transition';
  end if;

  -- Group-required invariant.
  if p_state in ('matched','joined') and v_grp is null then
    raise exception 'group_required';
  end if;

  -- A Match/Join must point at a LIVE group (trust boundary; mirrors the
  -- original RPC). A missing group resolves to group_required; a closed one to
  -- group_closed.
  if p_state in ('matched','joined') then
    select lifecycle_status into v_lifecycle
      from public.groups where id = v_grp;
    if v_lifecycle is null then
      raise exception 'group_required';
    end if;
    if v_lifecycle = 'closed'::public.group_lifecycle_status then
      raise exception 'group_closed';
    end if;
  end if;

  -- Non-group states drop any carried group; joined archives.
  if p_state not in ('matched','joined') then
    v_grp := null;
  end if;
  v_archived := (p_state = 'joined');

  update public.prospects
     set state      = p_state,
         group_id   = v_grp,
         archived   = v_archived,
         updated_by = v_actor
   where id = p_prospect_id;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.transition_prospect',
    'prospects',
    p_prospect_id,
    jsonb_build_object(
      'before', jsonb_build_object('state', v_from, 'group_id', v_cur_grp),
      'after',  jsonb_build_object('state', p_state, 'group_id', v_grp, 'archived', v_archived)
    )
  );

  return p_prospect_id;
end;
$$;

-- Re-assert grants (create or replace preserves them, but keep the migration
-- self-contained and consistent with the original definition).
revoke all on function public.admin_transition_prospect(uuid, public.prospect_state, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_transition_prospect(uuid, public.prospect_state, uuid)
  to authenticated;

comment on function public.admin_transition_prospect(uuid, public.prospect_state, uuid) is
  'Interest Funnel (#375): transitions a Prospect''s state, enforcing legal edges + group-required + joined-archives, and rejecting transitions on an archived prospect (prospect_archived) so a cleanup-archive isn''t silently undone. Writes a paired audit_events row.';
