-- Julian feedback P4b: multiplication candidate pipeline.
--
-- Replaces Julian's Google Doc (LG_MULTIPLICATION_PLAN_2026.md): which named
-- groups are slated to multiply, their target year, and where they stand
-- against his readiness criteria (12+ members, 3+ years, co-shepherd 1+ year,
-- shepherd willing, need for a similar-stage group). Readiness is computed in
-- TS (lib/admin/multiplication.ts) from group data + the manual flags below.
--
-- Architecture parity: admin-only RLS read, SECURITY DEFINER write path only,
-- paired audit_events rows, no hard deletes (archive sets archived_at).

-- ---------------------------------------------------------------------------
-- 1. Status enum + table.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'multiplication_candidate_status') then
    create type public.multiplication_candidate_status as enum (
      'watching','planned','launched','deferred'
    );
  end if;
end$$;

create table if not exists public.multiplication_candidates (
  id                   uuid primary key default gen_random_uuid(),
  group_id             uuid not null references public.groups(id) on delete cascade,
  target_year          integer,
  status               public.multiplication_candidate_status not null default 'watching',
  shepherd_willing     boolean not null default false,
  needs_similar_stage  boolean not null default false,
  notes                text,
  archived_at          timestamptz,
  created_by           uuid references public.profiles(id) on delete set null,
  updated_by           uuid references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint multiplication_candidates_target_year_bounds
    check (target_year is null or (target_year between 2024 and 2100)),
  constraint multiplication_candidates_notes_length
    check (notes is null or char_length(notes) <= 2000)
);

-- At most one active (non-archived) candidate per group.
create unique index if not exists multiplication_candidates_one_active_per_group
  on public.multiplication_candidates (group_id)
  where archived_at is null;

drop trigger if exists multiplication_candidates_set_updated_at
  on public.multiplication_candidates;
create trigger multiplication_candidates_set_updated_at
  before update on public.multiplication_candidates
  for each row execute function public.set_updated_at();

alter table public.multiplication_candidates enable row level security;

drop policy if exists multiplication_candidates_admin_read
  on public.multiplication_candidates;
create policy multiplication_candidates_admin_read
  on public.multiplication_candidates
  for select to authenticated using (public.auth_is_admin());

revoke all    on public.multiplication_candidates from public;
revoke all    on public.multiplication_candidates from anon;
revoke all    on public.multiplication_candidates from authenticated;
grant  select on public.multiplication_candidates to authenticated;

comment on table public.multiplication_candidates is
  'Julian P4: named groups slated to multiply, with target year, status, and the manual readiness flags. Admin-only RLS; writes only via admin_*_multiplication_candidate RPCs.';

-- ---------------------------------------------------------------------------
-- 2. RPC: create.
-- ---------------------------------------------------------------------------

create or replace function public.admin_create_multiplication_candidate(
  p_group_id            uuid,
  p_target_year         integer,
  p_status              public.multiplication_candidate_status,
  p_shepherd_willing    boolean,
  p_needs_similar_stage boolean,
  p_notes               text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_group_exists boolean;
  v_notes text;
  v_status public.multiplication_candidate_status;
  v_new_id uuid;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_target_year is not null and (p_target_year < 2024 or p_target_year > 2100) then
    raise exception 'invalid_input';
  end if;

  v_notes := nullif(btrim(coalesce(p_notes, '')), '');
  if v_notes is not null and char_length(v_notes) > 2000 then
    raise exception 'invalid_input';
  end if;
  v_status := coalesce(p_status, 'watching'::public.multiplication_candidate_status);

  select true into v_group_exists from public.groups where id = p_group_id for update;
  if v_group_exists is null then
    raise exception 'missing_group';
  end if;

  if exists (
    select 1 from public.multiplication_candidates
     where group_id = p_group_id and archived_at is null
  ) then
    raise exception 'candidate_exists';
  end if;

  insert into public.multiplication_candidates (
    group_id, target_year, status, shepherd_willing, needs_similar_stage,
    notes, created_by, updated_by
  )
  values (
    p_group_id, p_target_year, v_status,
    coalesce(p_shepherd_willing, false), coalesce(p_needs_similar_stage, false),
    v_notes, v_actor, v_actor
  )
  returning id into v_new_id;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.create_multiplication_candidate',
    'multiplication_candidates',
    v_new_id,
    jsonb_build_object('after', jsonb_build_object(
      'group_id', p_group_id, 'target_year', p_target_year, 'status', v_status,
      'shepherd_willing', coalesce(p_shepherd_willing, false),
      'needs_similar_stage', coalesce(p_needs_similar_stage, false),
      'has_notes', v_notes is not null
    ))
  );

  return v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. RPC: update (fields + status).
-- ---------------------------------------------------------------------------

create or replace function public.admin_update_multiplication_candidate(
  p_candidate_id        uuid,
  p_target_year         integer,
  p_status              public.multiplication_candidate_status,
  p_shepherd_willing    boolean,
  p_needs_similar_stage boolean,
  p_notes               text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_notes text;
  v_status public.multiplication_candidate_status;
  v_before jsonb;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_target_year is not null and (p_target_year < 2024 or p_target_year > 2100) then
    raise exception 'invalid_input';
  end if;

  v_notes := nullif(btrim(coalesce(p_notes, '')), '');
  if v_notes is not null and char_length(v_notes) > 2000 then
    raise exception 'invalid_input';
  end if;
  v_status := coalesce(p_status, 'watching'::public.multiplication_candidate_status);

  select jsonb_build_object(
           'target_year', target_year, 'status', status,
           'shepherd_willing', shepherd_willing,
           'needs_similar_stage', needs_similar_stage,
           'has_notes', notes is not null
         )
    into v_before
    from public.multiplication_candidates
   where id = p_candidate_id and archived_at is null
   for update;

  if v_before is null then
    raise exception 'missing_candidate';
  end if;

  update public.multiplication_candidates
     set target_year         = p_target_year,
         status              = v_status,
         shepherd_willing    = coalesce(p_shepherd_willing, false),
         needs_similar_stage = coalesce(p_needs_similar_stage, false),
         notes               = v_notes,
         updated_by          = v_actor
   where id = p_candidate_id;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.update_multiplication_candidate',
    'multiplication_candidates',
    p_candidate_id,
    jsonb_build_object('before', v_before, 'after', jsonb_build_object(
      'target_year', p_target_year, 'status', v_status,
      'shepherd_willing', coalesce(p_shepherd_willing, false),
      'needs_similar_stage', coalesce(p_needs_similar_stage, false),
      'has_notes', v_notes is not null
    ))
  );

  return p_candidate_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. RPC: archive (soft-delete).
-- ---------------------------------------------------------------------------

create or replace function public.admin_archive_multiplication_candidate(
  p_candidate_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_exists boolean;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  select true into v_exists
    from public.multiplication_candidates
   where id = p_candidate_id and archived_at is null
   for update;
  if v_exists is null then
    raise exception 'missing_candidate';
  end if;

  update public.multiplication_candidates
     set archived_at = now(), updated_by = v_actor
   where id = p_candidate_id;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.archive_multiplication_candidate',
    'multiplication_candidates',
    p_candidate_id,
    jsonb_build_object('archived', true)
  );

  return p_candidate_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Grants.
-- ---------------------------------------------------------------------------

revoke all on function public.admin_create_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text
) from public, anon, authenticated;
grant execute on function public.admin_create_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text
) to authenticated;

revoke all on function public.admin_update_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text
) from public, anon, authenticated;
grant execute on function public.admin_update_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text
) to authenticated;

revoke all on function public.admin_archive_multiplication_candidate(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_archive_multiplication_candidate(uuid)
  to authenticated;

comment on function public.admin_create_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text
) is 'Julian P4 admin write: adds a multiplication candidate for a group (one active per group). Writes a paired audit_events row.';
comment on function public.admin_update_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text
) is 'Julian P4 admin write: updates a multiplication candidate''s target year, status, and readiness flags. Writes a paired audit_events row.';
comment on function public.admin_archive_multiplication_candidate(uuid)
  is 'Julian P4 admin write: soft-archives a multiplication candidate. Writes a paired audit_events row.';
