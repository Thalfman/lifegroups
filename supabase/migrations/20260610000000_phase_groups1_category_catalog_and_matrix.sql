-- Group Category catalog + (top type × category) cell matrix (#396 / Settings
-- Overhaul PRD §2.1, §3). This is the FOUNDATION slice of the groups overhaul:
-- a free-form category catalog and the activation linkage between a top type
-- (audience_category) and a category (the "cell"). Targets, triggers, interest
-- capture and the Multiply grid rewrite are LATER slices — the target/trigger
-- columns are created here (per the PRD data model) but stay defaulted/unused.
--
-- Architecture parity with multiplication_config / health_rubrics /
-- launch_planning_scenarios:
--   * admin-only RLS read (auth_is_admin())
--   * write only via SECURITY DEFINER RPCs with a pinned search_path
--   * paired audit_events rows, no service-role writes
--   * EXECUTE lockdown (revoke from public/anon/authenticated, grant authenticated)
--
-- Deletion follows the repo's Archive convention (CONTEXT.md): a category leaves
-- the catalog by a reversible soft delete (archived_at), never a hard delete —
-- the row stays so its cells + audit history are never orphaned.

-- ---------------------------------------------------------------------------
-- 1. Table: the free-form category catalog. Labels are NOT tied to a top type.
-- ---------------------------------------------------------------------------

create table if not exists public.group_categories (
  id          uuid primary key default gen_random_uuid(),
  -- Free-form admin label: "20-30s", "40-50s", "Young families". The same label
  -- can sit under any of the three top types via a cell row below.
  label       text not null,
  -- Archive convention: a category leaves the catalog by soft delete. The row
  -- stays so its cells + audit trail are never orphaned; an archived category
  -- (and its cells) drop out of the matrix read.
  archived_at timestamptz,
  created_by  uuid references public.profiles(id) on delete set null,
  updated_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint group_categories_label_not_blank
    check (length(btrim(label)) > 0)
);

-- One live (non-archived) category per label, case-insensitively — so the
-- catalog can't grow two "20-30s" rows. Archived rows are exempt so a label can
-- be reused after its category is archived.
create unique index if not exists group_categories_label_live_unique
  on public.group_categories (lower(btrim(label)))
  where archived_at is null;

drop trigger if exists group_categories_set_updated_at on public.group_categories;
create trigger group_categories_set_updated_at
  before update on public.group_categories
  for each row execute function public.set_updated_at();

alter table public.group_categories enable row level security;

-- Admin-only read. auth_is_admin() admits super_admin + ministry_admin; the
-- catalog is Julian's group configuration, never leader-facing.
drop policy if exists group_categories_admin_read on public.group_categories;
create policy group_categories_admin_read
  on public.group_categories
  for select to authenticated using (public.auth_is_admin());

revoke all    on public.group_categories from public;
revoke all    on public.group_categories from anon;
revoke all    on public.group_categories from authenticated;
grant  select on public.group_categories to authenticated;

comment on table public.group_categories is
  'Group Category catalog (#396): free-form admin labels, not tied to a top type. Admin-only RLS; writes only via admin_create/rename/archive_group_category. Soft-delete via archived_at (Archive convention).';

-- ---------------------------------------------------------------------------
-- 2. Table: the (audience_category × category) cell. The live unit of the
--    groups overhaul. Applying a category to a top type activates its cell.
-- ---------------------------------------------------------------------------

create table if not exists public.category_type_targets (
  id                uuid primary key default gen_random_uuid(),
  -- The top type this cell sits under: Men's / Women's / Mixed.
  audience_category text not null,
  -- The catalog category this cell applies. FK to the catalog.
  category_id       uuid not null references public.group_categories(id) on delete cascade,
  -- Whether the cell is ACTIVE — i.e. the category is applied to this top type.
  -- Deactivating leaves the row (with its target/overrides) rather than deleting
  -- it, so re-applying restores the prior config.
  active            boolean not null default true,
  -- LATER SLICE (PRD §2.3): the cell's target group count ("must have 2"). Created
  -- now per the PRD data model but defaulted + unused this slice.
  target_count      integer not null default 0,
  -- LATER SLICE (PRD §2.4): per-cell trigger overrides over the global rule.
  -- Created now per the PRD data model but defaulted to '{}' + unused this slice.
  trigger_overrides jsonb not null default '{}'::jsonb,
  created_by        uuid references public.profiles(id) on delete set null,
  updated_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- One cell per (top type, category) — the apply/unapply conflict target.
  constraint category_type_targets_type_category_unique
    unique (audience_category, category_id),
  constraint category_type_targets_audience_valid
    check (audience_category in ('men','women','mixed')),
  constraint category_type_targets_target_count_nonneg
    check (target_count >= 0),
  constraint category_type_targets_overrides_is_object
    check (jsonb_typeof(trigger_overrides) = 'object')
);

drop trigger if exists category_type_targets_set_updated_at on public.category_type_targets;
create trigger category_type_targets_set_updated_at
  before update on public.category_type_targets
  for each row execute function public.set_updated_at();

alter table public.category_type_targets enable row level security;

drop policy if exists category_type_targets_admin_read on public.category_type_targets;
create policy category_type_targets_admin_read
  on public.category_type_targets
  for select to authenticated using (public.auth_is_admin());

revoke all    on public.category_type_targets from public;
revoke all    on public.category_type_targets from anon;
revoke all    on public.category_type_targets from authenticated;
grant  select on public.category_type_targets to authenticated;

comment on table public.category_type_targets is
  'Cell config (#396 / PRD §3): one row per active (audience_category × category) cell — the live unit of the groups overhaul. Admin-only RLS; writes only via admin_set_category_type_cell. target_count + trigger_overrides are later-slice columns, defaulted/unused here.';

-- ---------------------------------------------------------------------------
-- 3. RPC: create a catalog category. Returns the new id.
-- ---------------------------------------------------------------------------

create or replace function public.admin_create_group_category(
  p_label text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_label text;
  v_id    uuid;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  v_label := btrim(coalesce(p_label, ''));
  if length(v_label) = 0 then
    raise exception 'invalid_input';
  end if;

  -- Reject a duplicate live label up front with a stable token, rather than
  -- leaking the unique-index violation. Case-insensitive, matching the index.
  if exists (
    select 1 from public.group_categories
     where archived_at is null
       and lower(btrim(label)) = lower(v_label)
  ) then
    raise exception 'duplicate_label';
  end if;

  insert into public.group_categories (label, created_by, updated_by)
  values (v_label, v_actor, v_actor)
  returning id into v_id;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.create_group_category',
    'group_category',
    v_id,
    jsonb_build_object('label', v_label)
  );

  return v_id;
end;
$$;

revoke all on function public.admin_create_group_category(text)
  from public, anon, authenticated;
grant execute on function public.admin_create_group_category(text)
  to authenticated;

comment on function public.admin_create_group_category(text) is
  'Group catalog (#396) admin write: creates a free-form category. Rejects a blank or duplicate-live label. Writes a paired audit_events row.';

-- ---------------------------------------------------------------------------
-- 4. RPC: rename a catalog category. Returns the id.
-- ---------------------------------------------------------------------------

create or replace function public.admin_rename_group_category(
  p_category_id uuid,
  p_label       text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor  uuid;
  v_label  text;
  v_before text;
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
  v_label := btrim(coalesce(p_label, ''));
  if length(v_label) = 0 then
    raise exception 'invalid_input';
  end if;

  select label into v_before
    from public.group_categories
   where id = p_category_id and archived_at is null
   for update;
  if v_before is null then
    raise exception 'missing_category';
  end if;

  -- Block a rename that would collide with another live label.
  if exists (
    select 1 from public.group_categories
     where archived_at is null
       and id <> p_category_id
       and lower(btrim(label)) = lower(v_label)
  ) then
    raise exception 'duplicate_label';
  end if;

  update public.group_categories
     set label = v_label, updated_by = v_actor
   where id = p_category_id;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.rename_group_category',
    'group_category',
    p_category_id,
    jsonb_build_object('before', v_before, 'after', v_label)
  );

  return p_category_id;
end;
$$;

revoke all on function public.admin_rename_group_category(uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_rename_group_category(uuid, text)
  to authenticated;

comment on function public.admin_rename_group_category(uuid, text) is
  'Group catalog (#396) admin write: renames a live category. Rejects a blank or duplicate-live label, or a missing/archived id. Writes a paired audit_events row.';

-- ---------------------------------------------------------------------------
-- 5. RPC: archive (delete) a catalog category — the Archive convention. The
--    row stays (reversible); the matrix read drops archived categories + cells.
-- ---------------------------------------------------------------------------

create or replace function public.admin_archive_group_category(
  p_category_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_label text;
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

  select label into v_label
    from public.group_categories
   where id = p_category_id and archived_at is null
   for update;
  if v_label is null then
    raise exception 'missing_category';
  end if;

  update public.group_categories
     set archived_at = now(), updated_by = v_actor
   where id = p_category_id;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.archive_group_category',
    'group_category',
    p_category_id,
    jsonb_build_object('label', v_label)
  );

  return p_category_id;
end;
$$;

revoke all on function public.admin_archive_group_category(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_archive_group_category(uuid)
  to authenticated;

comment on function public.admin_archive_group_category(uuid) is
  'Group catalog (#396) admin write: archives (soft-deletes) a category per the Archive convention. The row + its cells stay; the matrix read drops archived categories. Writes a paired audit_events row.';

-- ---------------------------------------------------------------------------
-- 6. RPC: apply/unapply a category to a top type — activate/deactivate the
--    cell. Upserts the (audience_category × category) row's `active` flag.
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_category_type_cell(
  p_category_id       uuid,
  p_audience_category text,
  p_active            boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor  uuid;
  v_before boolean;
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
  if p_active is null then
    raise exception 'invalid_input';
  end if;

  -- The cell can only apply a LIVE category. Lock the catalog row so an archive
  -- racing this apply can't leave a cell pointing at an archived category.
  if not exists (
    select 1 from public.group_categories
     where id = p_category_id and archived_at is null
     for update
  ) then
    raise exception 'missing_category';
  end if;

  -- Snapshot the prior active state (if the cell exists) for the audit pair.
  select active into v_before
    from public.category_type_targets
   where audience_category = p_audience_category
     and category_id = p_category_id
   for update;

  insert into public.category_type_targets (
    audience_category, category_id, active, created_by, updated_by
  )
  values (p_audience_category, p_category_id, p_active, v_actor, v_actor)
  on conflict (audience_category, category_id) do update
     set active     = excluded.active,
         updated_by = v_actor
  returning id into v_id;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.set_category_type_cell',
    'category_type_target',
    v_id,
    jsonb_build_object(
      'category_id', p_category_id,
      'audience_category', p_audience_category,
      'before_active', v_before,
      'after_active', p_active
    )
  );

  return v_id;
end;
$$;

revoke all on function public.admin_set_category_type_cell(uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_set_category_type_cell(uuid, text, boolean)
  to authenticated;

comment on function public.admin_set_category_type_cell(uuid, text, boolean) is
  'Cell config (#396) admin write: applies/unapplies a live category to a top type by upserting the (audience_category × category) cell''s active flag. Writes a paired audit_events row.';
