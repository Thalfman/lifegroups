-- Per-cell target group count write path (#400 / Settings Overhaul PRD §2.3, §4).
-- Wave 1 (20260610000000_phase_groups1_category_catalog_and_matrix.sql) created
-- the `category_type_targets.target_count integer not null default 0` column per
-- the PRD data model but left it defaulted/unused. This slice gives an admin the
-- WRITE PATH to set it, so each active cell can say "this cell should have N
-- groups" and Settings/Multiply can read coverage as `have X of Y` against it.
--
-- Targets are TRACKING ONLY — they do NOT feed the multiply trigger (PRD §2.3).
-- The coverage X (count of active + actively-launching groups in the cell) and
-- the read seam / panel / inline readout are all surface-side TypeScript; nothing
-- here changes the trigger/readiness logic.
--
-- Default trigger thresholds (PRD §4.1) are OUT OF SCOPE here — they belong to the
-- triggers slice, not this target-count slice.
--
-- Scope of this migration: the column already exists, so we do NOT alter it. We
-- add ONE audited SECURITY DEFINER RPC (admin_set_category_type_target_count),
-- mirroring admin_set_category_type_cell, plus its EXECUTE lockdown + comment.
--
-- Architecture parity with admin_set_category_type_cell (wave 1):
--   * auth_is_admin() guard + auth_profile_id() actor
--   * pinned search_path = public, pg_temp
--   * upsert on the same (audience_category, category_id) conflict target
--   * a paired audit_events row recording before/after target_count
--   * EXECUTE lockdown (revoke from public/anon/authenticated, grant authenticated)

-- ---------------------------------------------------------------------------
-- RPC: set a cell's target_count. Upserts the (audience_category × category)
-- row's target_count, creating the cell row if it doesn't exist yet. Validates
-- the count is non-negative, the top type is one of the three, and the category
-- is LIVE (non-archived) — the same gates the cell apply RPC uses.
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_category_type_target_count(
  p_category_id       uuid,
  p_audience_category text,
  p_count             integer
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor  uuid;
  v_before integer;
  v_id     uuid;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_category_id is null then
    raise exception 'invalid_input';
  end if;
  if p_audience_category is null
     or p_audience_category not in ('men','women','mixed') then
    raise exception 'invalid_input';
  end if;
  -- The target is a non-negative count; the column carries the same CHECK, but we
  -- reject up front with a stable token rather than leaking the constraint error.
  if p_count is null or p_count < 0 then
    raise exception 'invalid_input';
  end if;

  -- The cell can only target a LIVE category. Lock the catalog row so an archive
  -- racing this set can't leave a target pointing at an archived category.
  if not exists (
    select 1 from public.group_categories
     where id = p_category_id and archived_at is null
     for update
  ) then
    raise exception 'missing_category';
  end if;

  -- Snapshot the prior target (if the cell exists) for the audit pair.
  select target_count into v_before
    from public.category_type_targets
   where audience_category = p_audience_category
     and category_id = p_category_id
   for update;

  insert into public.category_type_targets (
    audience_category, category_id, target_count, created_by, updated_by
  )
  values (p_audience_category, p_category_id, p_count, v_actor, v_actor)
  on conflict (audience_category, category_id) do update
     set target_count = excluded.target_count,
         updated_by   = v_actor
  returning id into v_id;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.set_category_type_target_count',
    'category_type_target',
    v_id,
    jsonb_build_object(
      'category_id', p_category_id,
      'audience_category', p_audience_category,
      'before_target_count', v_before,
      'after_target_count', p_count
    )
  );

  return v_id;
end;
$$;

revoke all on function public.admin_set_category_type_target_count(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.admin_set_category_type_target_count(uuid, text, integer)
  to authenticated;

comment on function public.admin_set_category_type_target_count(uuid, text, integer) is
  'Cell config (#400 / PRD §2.3) admin write: sets a (audience_category × category) cell''s target_count by upserting on the per-(type, category) conflict target. Validates a non-negative count and a live category. Tracking only — does NOT feed the multiply trigger. Writes a paired audit_events row with before/after target_count.';
