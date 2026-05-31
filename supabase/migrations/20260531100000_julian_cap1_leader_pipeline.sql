-- Capacity & Multiplication PRD — slice CAP.1 (#183): the Leader Pipeline spine.
--
-- A first-class Apprentice record: a leader-in-training attached to a group,
-- the person being raised up to lead the *next* group. This replaces today's
-- free-text successor_designate string with a real, trackable record that
-- carries a readiness stage (Identified → In training → Ready to lead →
-- Launched) and an optional expected-ready date (drives by-the-season staffing
-- supply in the forecast, PRD §3.4 / R10).
--
-- Provisional person shape per the PRD's locked-in build call (§6-1, open
-- decision §9-b): a required `display_name` text *and* a nullable `member_id`
-- FK to members. Name-only stays valid; a members row can be attached later.
--
-- Architecture parity with 20260528160000 (multiplication pipeline): admin-only
-- RLS read, SECURITY DEFINER write path only, paired audit_events rows, no hard
-- deletes (archive sets archived_at). Consistent with ADR-0001.

-- ---------------------------------------------------------------------------
-- 1. Readiness-stage enum + table.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'leader_readiness_stage') then
    create type public.leader_readiness_stage as enum (
      'identified','in_training','ready_to_lead','launched'
    );
  end if;
end$$;

create table if not exists public.leader_pipeline (
  id                uuid primary key default gen_random_uuid(),
  group_id          uuid not null references public.groups(id) on delete cascade,
  display_name      text not null,
  member_id         uuid references public.members(id) on delete set null,
  readiness_stage   public.leader_readiness_stage not null default 'identified',
  expected_ready_on date,
  notes             text,
  archived_at       timestamptz,
  created_by        uuid references public.profiles(id) on delete set null,
  updated_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint leader_pipeline_display_name_length
    check (char_length(btrim(display_name)) between 1 and 120),
  constraint leader_pipeline_notes_length
    check (notes is null or char_length(notes) <= 2000)
);

create index if not exists idx_leader_pipeline_group
  on public.leader_pipeline (group_id)
  where archived_at is null;
create index if not exists idx_leader_pipeline_stage
  on public.leader_pipeline (readiness_stage)
  where archived_at is null;

drop trigger if exists leader_pipeline_set_updated_at on public.leader_pipeline;
create trigger leader_pipeline_set_updated_at
  before update on public.leader_pipeline
  for each row execute function public.set_updated_at();

alter table public.leader_pipeline enable row level security;

drop policy if exists leader_pipeline_admin_read on public.leader_pipeline;
create policy leader_pipeline_admin_read
  on public.leader_pipeline
  for select to authenticated using (public.auth_is_admin());

revoke all    on public.leader_pipeline from public;
revoke all    on public.leader_pipeline from anon;
revoke all    on public.leader_pipeline from authenticated;
grant  select on public.leader_pipeline to authenticated;

comment on table public.leader_pipeline is
  'Capacity & Multiplication #183: apprentices (leaders-in-training) attached to a group, with a readiness stage and optional expected-ready date. Admin-only RLS; writes only via admin_*_apprentice RPCs. Provisional person shape: required display_name + nullable member_id (PRD §6-1 / §9-b).';
comment on column public.leader_pipeline.display_name is
  'Required name of the apprentice. Seeded from successor_designate; a members row can be attached later via member_id.';
comment on column public.leader_pipeline.member_id is
  'Optional FK to members — the person record once attached. Nullable so name-only apprentices stay valid (PRD §9-b provisional shape).';
comment on column public.leader_pipeline.expected_ready_on is
  'When Julian expects this apprentice to reach Ready to lead. Drives by-the-season staffing supply in the launch forecast (PRD §3.4 / R5a / R10).';

-- ---------------------------------------------------------------------------
-- 2. RPC: create.
-- ---------------------------------------------------------------------------

create or replace function public.admin_create_apprentice(
  p_group_id          uuid,
  p_display_name      text,
  p_member_id         uuid,
  p_readiness_stage   public.leader_readiness_stage,
  p_expected_ready_on date,
  p_notes             text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_group_exists boolean;
  v_member_group boolean;
  v_name text;
  v_notes text;
  v_stage public.leader_readiness_stage;
  v_new_id uuid;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  v_name := nullif(btrim(coalesce(p_display_name, '')), '');
  if v_name is null or char_length(v_name) > 120 then
    raise exception 'invalid_input';
  end if;

  v_notes := nullif(btrim(coalesce(p_notes, '')), '');
  if v_notes is not null and char_length(v_notes) > 2000 then
    raise exception 'invalid_input';
  end if;

  v_stage := coalesce(p_readiness_stage, 'identified'::public.leader_readiness_stage);

  select true into v_group_exists from public.groups where id = p_group_id for update;
  if v_group_exists is null then
    raise exception 'missing_group';
  end if;

  if p_member_id is not null then
    select true into v_member_group from public.members where id = p_member_id;
    if v_member_group is null then
      raise exception 'missing_member';
    end if;
  end if;

  insert into public.leader_pipeline (
    group_id, display_name, member_id, readiness_stage, expected_ready_on,
    notes, created_by, updated_by
  )
  values (
    p_group_id, v_name, p_member_id, v_stage, p_expected_ready_on,
    v_notes, v_actor, v_actor
  )
  returning id into v_new_id;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.create_apprentice',
    'leader_pipeline',
    v_new_id,
    jsonb_build_object('after', jsonb_build_object(
      'group_id', p_group_id,
      'readiness_stage', v_stage,
      'has_member', p_member_id is not null,
      'expected_ready_on', p_expected_ready_on,
      'has_notes', v_notes is not null
    ))
  );

  return v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. RPC: update (edit display_name, member link, stage, date, notes).
-- ---------------------------------------------------------------------------

create or replace function public.admin_update_apprentice(
  p_apprentice_id     uuid,
  p_display_name      text,
  p_member_id         uuid,
  p_readiness_stage   public.leader_readiness_stage,
  p_expected_ready_on date,
  p_notes             text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_member_exists boolean;
  v_name text;
  v_notes text;
  v_stage public.leader_readiness_stage;
  v_before jsonb;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  v_name := nullif(btrim(coalesce(p_display_name, '')), '');
  if v_name is null or char_length(v_name) > 120 then
    raise exception 'invalid_input';
  end if;

  v_notes := nullif(btrim(coalesce(p_notes, '')), '');
  if v_notes is not null and char_length(v_notes) > 2000 then
    raise exception 'invalid_input';
  end if;

  v_stage := coalesce(p_readiness_stage, 'identified'::public.leader_readiness_stage);

  select jsonb_build_object(
           'readiness_stage', readiness_stage,
           'has_member', member_id is not null,
           'expected_ready_on', expected_ready_on,
           'has_notes', notes is not null
         )
    into v_before
    from public.leader_pipeline
   where id = p_apprentice_id and archived_at is null
   for update;
  if v_before is null then
    raise exception 'missing_apprentice';
  end if;

  if p_member_id is not null then
    select true into v_member_exists from public.members where id = p_member_id;
    if v_member_exists is null then
      raise exception 'missing_member';
    end if;
  end if;

  update public.leader_pipeline
     set display_name      = v_name,
         member_id         = p_member_id,
         readiness_stage   = v_stage,
         expected_ready_on = p_expected_ready_on,
         notes             = v_notes,
         updated_by        = v_actor
   where id = p_apprentice_id;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.update_apprentice',
    'leader_pipeline',
    p_apprentice_id,
    jsonb_build_object('before', v_before, 'after', jsonb_build_object(
      'readiness_stage', v_stage,
      'has_member', p_member_id is not null,
      'expected_ready_on', p_expected_ready_on,
      'has_notes', v_notes is not null
    ))
  );

  return p_apprentice_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. RPC: advance-stage (stage-only convenience write).
-- ---------------------------------------------------------------------------

create or replace function public.admin_advance_apprentice_stage(
  p_apprentice_id   uuid,
  p_readiness_stage public.leader_readiness_stage
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_before public.leader_readiness_stage;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_readiness_stage is null then
    raise exception 'invalid_input';
  end if;

  select readiness_stage into v_before
    from public.leader_pipeline
   where id = p_apprentice_id and archived_at is null
   for update;
  if v_before is null then
    raise exception 'missing_apprentice';
  end if;

  update public.leader_pipeline
     set readiness_stage = p_readiness_stage,
         updated_by      = v_actor
   where id = p_apprentice_id;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.advance_apprentice_stage',
    'leader_pipeline',
    p_apprentice_id,
    jsonb_build_object(
      'before', jsonb_build_object('readiness_stage', v_before),
      'after', jsonb_build_object('readiness_stage', p_readiness_stage)
    )
  );

  return p_apprentice_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. RPC: archive (soft-delete).
-- ---------------------------------------------------------------------------

create or replace function public.admin_archive_apprentice(
  p_apprentice_id uuid
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
    from public.leader_pipeline
   where id = p_apprentice_id and archived_at is null
   for update;
  if v_exists is null then
    raise exception 'missing_apprentice';
  end if;

  update public.leader_pipeline
     set archived_at = now(), updated_by = v_actor
   where id = p_apprentice_id;

  -- Clear any active multiplication candidate that links to this apprentice, so
  -- the planner/board (which resolve the linked apprentice by id) never surface
  -- an archived apprentice + stale stage. Each cleared link is audited.
  with cleared as (
    update public.multiplication_candidates
       set leader_pipeline_id = null, updated_by = v_actor
     where leader_pipeline_id = p_apprentice_id and archived_at is null
    returning id
  )
  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  select v_actor, 'admin.update_multiplication_candidate', 'multiplication_candidates', id,
         jsonb_build_object('cleared_apprentice_link', p_apprentice_id)
    from cleared;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.archive_apprentice',
    'leader_pipeline',
    p_apprentice_id,
    jsonb_build_object('archived', true)
  );

  return p_apprentice_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Grants. Revoke from public/anon/authenticated, then grant execute to
--    authenticated. Bodies still enforce auth_is_admin().
-- ---------------------------------------------------------------------------

revoke all on function public.admin_create_apprentice(
  uuid, text, uuid, public.leader_readiness_stage, date, text
) from public, anon, authenticated;
grant execute on function public.admin_create_apprentice(
  uuid, text, uuid, public.leader_readiness_stage, date, text
) to authenticated;

revoke all on function public.admin_update_apprentice(
  uuid, text, uuid, public.leader_readiness_stage, date, text
) from public, anon, authenticated;
grant execute on function public.admin_update_apprentice(
  uuid, text, uuid, public.leader_readiness_stage, date, text
) to authenticated;

revoke all on function public.admin_advance_apprentice_stage(
  uuid, public.leader_readiness_stage
) from public, anon, authenticated;
grant execute on function public.admin_advance_apprentice_stage(
  uuid, public.leader_readiness_stage
) to authenticated;

revoke all on function public.admin_archive_apprentice(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_archive_apprentice(uuid)
  to authenticated;

comment on function public.admin_create_apprentice(
  uuid, text, uuid, public.leader_readiness_stage, date, text
) is 'Capacity & Multiplication #183 admin write: adds an apprentice to a group. Writes a paired audit_events row.';
comment on function public.admin_update_apprentice(
  uuid, text, uuid, public.leader_readiness_stage, date, text
) is 'Capacity & Multiplication #183 admin write: edits an apprentice (name, member link, stage, expected-ready date, notes). Writes a paired audit_events row.';
comment on function public.admin_advance_apprentice_stage(
  uuid, public.leader_readiness_stage
) is 'Capacity & Multiplication #183 admin write: advances an apprentice''s readiness stage. Writes a paired audit_events row.';
comment on function public.admin_archive_apprentice(uuid)
  is 'Capacity & Multiplication #183 admin write: soft-archives an apprentice. Writes a paired audit_events row.';
