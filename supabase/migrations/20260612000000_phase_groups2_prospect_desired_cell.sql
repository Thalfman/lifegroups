-- Capture a Prospect's DESIRED cell at intake; make Interest a per-cell headcount
-- (#399 / Settings Overhaul PRD §3, ADR 0016). The desired cell is the unit the
-- groups overhaul tallies interest on: a (top type × category) cell, named on the
-- Prospect at create time. Two nullable columns carry it (existing prospects have
-- none); the create RPC is extended to accept + store them, re-validating the
-- audience_category domain in SQL and recording presence in the paired audit.
--
-- Architecture parity with the prospects migration (#375) and the category
-- catalog (#396): admin-only RLS read (unchanged here), write only via the
-- SECURITY DEFINER admin_create_prospect RPC with a pinned search_path, a paired
-- audit_events row, EXECUTE lockdown. No new table, no RLS change — this only
-- adds two columns and re-defines the existing create RPC's signature/body.

-- ---------------------------------------------------------------------------
-- 1. Columns: the desired (top type × category) cell, both nullable.
-- ---------------------------------------------------------------------------
--
-- desired_audience_category is the top type (men/women/mixed), constrained to the
-- same domain as groups.audience_category + category_type_targets.audience_category.
-- desired_category_id FKs the catalog; on a category delete it set-nulls (the
-- catalog uses soft delete, so this is belt-and-braces — a hard delete must not
-- orphan a prospect). Both stay nullable: a prospect may be added without naming
-- a cell, and every pre-existing row has none.

alter table public.prospects
  add column if not exists desired_audience_category text,
  add column if not exists desired_category_id uuid
    references public.group_categories(id) on delete set null;

-- Domain guard on the top type, mirroring category_type_targets_audience_valid.
-- Null is allowed (no desired cell named). Guarded so a re-run does not fail on
-- the already-present constraint.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'prospects_desired_audience_valid'
  ) then
    alter table public.prospects
      add constraint prospects_desired_audience_valid
        check (desired_audience_category is null
               or desired_audience_category in ('men','women','mixed'));
  end if;
end$$;

-- Index the desired cell: the per-cell interest tally counts interested-state,
-- non-archived prospects grouped by (desired_audience_category, desired_category_id).
create index if not exists prospects_desired_cell_idx
  on public.prospects (desired_audience_category, desired_category_id)
  where archived = false and state = 'interested';

comment on column public.prospects.desired_audience_category is
  'Interest per cell (#399): the top type (men/women/mixed) of the cell this prospect wants, captured at intake. Null when no cell was named. Paired with desired_category_id.';
comment on column public.prospects.desired_category_id is
  'Interest per cell (#399): the catalog category of the cell this prospect wants. FK to group_categories (set null on delete). Null when no cell was named.';

-- ---------------------------------------------------------------------------
-- 2. RPC: extend admin_create_prospect to accept + store the desired cell.
-- ---------------------------------------------------------------------------
--
-- The two new params are appended (nullable) so existing callers that pass only
-- name/email/phone keep working through the named-arg wrapper. The RPC
-- re-validates the audience_category domain authoritatively and records presence
-- of the desired cell in the paired audit metadata (no PII).

create or replace function public.admin_create_prospect(
  p_full_name                text,
  p_email                    text,
  p_phone                    text,
  p_desired_audience_category text default null,
  p_desired_category_id      uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor    uuid;
  v_name     text;
  v_email    text;
  v_phone    text;
  v_audience text;
  v_category uuid;
  v_id       uuid;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  v_name := nullif(btrim(coalesce(p_full_name, '')), '');
  if v_name is null then
    raise exception 'invalid_input';
  end if;
  if char_length(v_name) > 120 then
    raise exception 'invalid_input';
  end if;
  v_email := nullif(btrim(coalesce(p_email, '')), '');
  v_phone := nullif(btrim(coalesce(p_phone, '')), '');

  -- Re-validate the desired top type's domain in SQL (the validator + the
  -- CHECK also guard it). An empty string collapses to null; an out-of-domain
  -- value is rejected with the stable invalid_input token.
  v_audience := nullif(btrim(coalesce(p_desired_audience_category, '')), '');
  if v_audience is not null and v_audience not in ('men','women','mixed') then
    raise exception 'invalid_input';
  end if;
  v_category := p_desired_category_id;

  insert into public.prospects (
    full_name, email, phone, state,
    desired_audience_category, desired_category_id,
    created_by, updated_by
  )
  values (
    v_name, v_email, v_phone, 'interested',
    v_audience, v_category,
    v_actor, v_actor
  )
  returning id into v_id;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.create_prospect',
    'prospects',
    v_id,
    jsonb_build_object(
      'has_email', v_email is not null,
      'has_phone', v_phone is not null,
      'state', 'interested',
      'has_desired_cell', (v_audience is not null and v_category is not null),
      'desired_audience_category', v_audience
    )
  );

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Grants: lock the new overload down (deny by default, allow authenticated).
-- ---------------------------------------------------------------------------
--
-- The signature changed, so this is a NEW function from the planner's view; its
-- EXECUTE must be re-locked. Drop the old 3-arg overload so only the extended
-- one remains the create path (a stale 3-arg overload would otherwise linger
-- with its own grants).

drop function if exists public.admin_create_prospect(text, text, text);

revoke all on function public.admin_create_prospect(text, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_create_prospect(text, text, text, text, uuid)
  to authenticated;

comment on function public.admin_create_prospect(text, text, text, text, uuid) is
  'Interest Funnel (#375, extended #399): creates a Prospect in the interested state, optionally naming the DESIRED (top type × category) cell it is interested in. Re-validates the audience_category domain; writes a paired audit_events row recording desired-cell presence.';
