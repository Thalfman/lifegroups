-- Capacity & Multiplication PRD — slice CAP.2 (#184): wire each Multiplication
-- Candidate to a real Apprentice (leader_pipeline) record instead of a
-- free-text successor name (§3.3, §6-2, R7, R8).
--
--   * Additive, nullable FK multiplication_candidates.leader_pipeline_id →
--     leader_pipeline. successor_designate is retained through the migration;
--     the link becomes the source of truth.
--   * Same-group constraint: the linked apprentice must belong to the
--     candidate's own group. Enforced two ways — a BEFORE trigger (the
--     DB-level check, since a CHECK can't reference another table) AND an
--     explicit guard inside the create/update RPCs (for a clean error token).
--   * Seed: create an apprentice from each active candidate's
--     successor_designate (display_name only) and link the candidate to it.
--
-- Architecture parity with 20260528160000 / 20260530060000: admin-only RLS
-- read, writes only via the admin_*_multiplication_candidate SECURITY DEFINER
-- RPCs (re-created here to thread the link), each paired with an audit_events
-- row; additive/nullable schema only; no hard deletes.

-- ---------------------------------------------------------------------------
-- 1. Additive, nullable FK.
-- ---------------------------------------------------------------------------

alter table public.multiplication_candidates
  add column if not exists leader_pipeline_id uuid
    references public.leader_pipeline(id) on delete set null;

comment on column public.multiplication_candidates.leader_pipeline_id is
  'Capacity & Multiplication #184: the apprentice (leader_pipeline row) raised to lead the multiplied group. Source of truth for "who leads it", replacing the retained free-text successor_designate. Must belong to the candidate''s own group (enforced by trigger + RPC).';

-- ---------------------------------------------------------------------------
-- 2. DB-level same-group check (a CHECK can't reference another table, so this
--    is a BEFORE trigger — the "where expressible" enforcement per the PRD).
-- ---------------------------------------------------------------------------

create or replace function public.multiplication_candidate_apprentice_same_group()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_group uuid;
begin
  if new.leader_pipeline_id is not null then
    select group_id into v_group
      from public.leader_pipeline
     where id = new.leader_pipeline_id;
    if v_group is null then
      raise exception 'missing_apprentice';
    end if;
    if v_group <> new.group_id then
      raise exception 'apprentice_group_mismatch';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists multiplication_candidates_apprentice_same_group
  on public.multiplication_candidates;
create trigger multiplication_candidates_apprentice_same_group
  before insert or update on public.multiplication_candidates
  for each row execute function public.multiplication_candidate_apprentice_same_group();

-- ---------------------------------------------------------------------------
-- 3. RPC: create (re-created to accept + persist the apprentice link).
-- ---------------------------------------------------------------------------

create or replace function public.admin_create_multiplication_candidate(
  p_group_id            uuid,
  p_target_year         integer,
  p_status              public.multiplication_candidate_status,
  p_shepherd_willing    boolean,
  p_needs_similar_stage boolean,
  p_notes               text,
  p_successor_designate text,
  p_meeting_time        public.multiplication_meeting_time,
  p_leader_pipeline_id  uuid
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
  v_successor text;
  v_status public.multiplication_candidate_status;
  v_apprentice_group uuid;
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

  v_successor := nullif(btrim(coalesce(p_successor_designate, '')), '');
  if v_successor is not null and char_length(v_successor) > 120 then
    raise exception 'invalid_input';
  end if;

  v_status := coalesce(p_status, 'watching'::public.multiplication_candidate_status);

  select true into v_group_exists from public.groups where id = p_group_id for update;
  if v_group_exists is null then
    raise exception 'missing_group';
  end if;

  -- Same-group guard: a linked apprentice must lead out of its own group, or
  -- the planner and ready badges would count the wrong leader.
  if p_leader_pipeline_id is not null then
    select group_id into v_apprentice_group
      from public.leader_pipeline
     where id = p_leader_pipeline_id and archived_at is null;
    if v_apprentice_group is null then
      raise exception 'missing_apprentice';
    end if;
    if v_apprentice_group <> p_group_id then
      raise exception 'apprentice_group_mismatch';
    end if;
  end if;

  if exists (
    select 1 from public.multiplication_candidates
     where group_id = p_group_id and archived_at is null
  ) then
    raise exception 'candidate_exists';
  end if;

  insert into public.multiplication_candidates (
    group_id, target_year, status, shepherd_willing, needs_similar_stage,
    notes, successor_designate, meeting_time, leader_pipeline_id,
    created_by, updated_by
  )
  values (
    p_group_id, p_target_year, v_status,
    coalesce(p_shepherd_willing, false), coalesce(p_needs_similar_stage, false),
    v_notes, v_successor, p_meeting_time, p_leader_pipeline_id, v_actor, v_actor
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
      'has_notes', v_notes is not null,
      'has_successor', v_successor is not null,
      'meeting_time', p_meeting_time,
      'has_apprentice_link', p_leader_pipeline_id is not null
    ))
  );

  return v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. RPC: update (re-created to accept + persist the apprentice link).
-- ---------------------------------------------------------------------------

create or replace function public.admin_update_multiplication_candidate(
  p_candidate_id        uuid,
  p_target_year         integer,
  p_status              public.multiplication_candidate_status,
  p_shepherd_willing    boolean,
  p_needs_similar_stage boolean,
  p_notes               text,
  p_successor_designate text,
  p_meeting_time        public.multiplication_meeting_time,
  p_leader_pipeline_id  uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_notes text;
  v_successor text;
  v_status public.multiplication_candidate_status;
  v_group_id uuid;
  v_apprentice_group uuid;
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

  v_successor := nullif(btrim(coalesce(p_successor_designate, '')), '');
  if v_successor is not null and char_length(v_successor) > 120 then
    raise exception 'invalid_input';
  end if;

  v_status := coalesce(p_status, 'watching'::public.multiplication_candidate_status);

  select group_id, jsonb_build_object(
           'target_year', target_year, 'status', status,
           'shepherd_willing', shepherd_willing,
           'needs_similar_stage', needs_similar_stage,
           'has_notes', notes is not null,
           'has_successor', successor_designate is not null,
           'meeting_time', meeting_time,
           'has_apprentice_link', leader_pipeline_id is not null
         )
    into v_group_id, v_before
    from public.multiplication_candidates
   where id = p_candidate_id and archived_at is null
   for update;

  if v_before is null then
    raise exception 'missing_candidate';
  end if;

  -- Same-group guard against the candidate's own group.
  if p_leader_pipeline_id is not null then
    select group_id into v_apprentice_group
      from public.leader_pipeline
     where id = p_leader_pipeline_id and archived_at is null;
    if v_apprentice_group is null then
      raise exception 'missing_apprentice';
    end if;
    if v_apprentice_group <> v_group_id then
      raise exception 'apprentice_group_mismatch';
    end if;
  end if;

  update public.multiplication_candidates
     set target_year         = p_target_year,
         status              = v_status,
         shepherd_willing    = coalesce(p_shepherd_willing, false),
         needs_similar_stage = coalesce(p_needs_similar_stage, false),
         notes               = v_notes,
         successor_designate = v_successor,
         meeting_time        = p_meeting_time,
         leader_pipeline_id  = p_leader_pipeline_id,
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
      'has_notes', v_notes is not null,
      'has_successor', v_successor is not null,
      'meeting_time', p_meeting_time,
      'has_apprentice_link', p_leader_pipeline_id is not null
    ))
  );

  return p_candidate_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Grants. Drop the old 8-arg signatures so callers must use the new 9-arg
--    shape; re-grant execute on the new functions to authenticated only.
-- ---------------------------------------------------------------------------

drop function if exists public.admin_create_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text,
  text, public.multiplication_meeting_time
);
drop function if exists public.admin_update_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text,
  text, public.multiplication_meeting_time
);

revoke all on function public.admin_create_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text,
  text, public.multiplication_meeting_time, uuid
) from public, anon, authenticated;
grant execute on function public.admin_create_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text,
  text, public.multiplication_meeting_time, uuid
) to authenticated;

revoke all on function public.admin_update_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text,
  text, public.multiplication_meeting_time, uuid
) from public, anon, authenticated;
grant execute on function public.admin_update_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text,
  text, public.multiplication_meeting_time, uuid
) to authenticated;

comment on function public.admin_create_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text,
  text, public.multiplication_meeting_time, uuid
) is 'Capacity & Multiplication #184 admin write: adds a multiplication candidate (one active per group), including an optional same-group apprentice link. Writes a paired audit_events row.';
comment on function public.admin_update_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text,
  text, public.multiplication_meeting_time, uuid
) is 'Capacity & Multiplication #184 admin write: updates a multiplication candidate, including its same-group apprentice link. Writes a paired audit_events row.';

-- ---------------------------------------------------------------------------
-- 6. Seed: create an apprentice from each active candidate's
--    successor_designate and link the candidate to it, where not already
--    linked. One active candidate per group (partial unique index) lets us map
--    the seeded apprentice back to its candidate by group_id. Idempotent: only
--    fires for candidates that have a successor name and no link yet.
-- ---------------------------------------------------------------------------

with seeded as (
  insert into public.leader_pipeline (
    group_id, display_name, readiness_stage, notes, created_by, updated_by
  )
  select c.group_id,
         btrim(c.successor_designate),
         'identified'::public.leader_readiness_stage,
         'Seeded from the multiplication candidate''s successor/leader-designate (#184).',
         c.created_by,
         c.updated_by
    from public.multiplication_candidates c
   where c.archived_at is null
     and c.leader_pipeline_id is null
     and c.successor_designate is not null
     and btrim(c.successor_designate) <> ''
  returning id, group_id
)
update public.multiplication_candidates c
   set leader_pipeline_id = s.id
  from seeded s
 where c.group_id = s.group_id
   and c.archived_at is null
   and c.leader_pipeline_id is null;
