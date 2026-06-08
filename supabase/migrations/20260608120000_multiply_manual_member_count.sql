-- ADR 0022 — Multiply unifies Plan/Readiness/Leaders. Julian-fed headcount.
--
-- The Multiply area's Plan tab re-homes the per-group multiplication planner
-- (ADR 0006) into a visible surface. Per the pivot (ADR 0016/0019), the church's
-- real headcounts are Julian's to enter, not the in-app roster — so each
-- candidate gains a manually-entered member count that takes precedence over the
-- computed roster count for the planner's display and the "12+ members"
-- readiness criterion. Null = fall back to the roster count (so seeded
-- candidates aren't shown as "0 members" until Julian backfills them).
--
-- Architecture parity with 20260531110000: additive/nullable column only; writes
-- only via the admin_*_multiplication_candidate SECURITY DEFINER RPCs (re-created
-- here to thread the count), each paired with an audit_events row; admin-only
-- RLS unchanged; no hard deletes.

-- ---------------------------------------------------------------------------
-- 1. Additive, nullable column + bounds constraint (matches the RPC's check).
-- ---------------------------------------------------------------------------

alter table public.multiplication_candidates
  add column if not exists manual_member_count integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'multiplication_candidates_manual_member_count_bounds'
  ) then
    alter table public.multiplication_candidates
      add constraint multiplication_candidates_manual_member_count_bounds
      check (
        manual_member_count is null
        or (manual_member_count >= 0 and manual_member_count <= 1000)
      );
  end if;
end$$;

comment on column public.multiplication_candidates.manual_member_count is
  'ADR 0022: Julian-fed headcount for this group, taking precedence over the in-app roster count for the planner display and the "12+ members" readiness criterion. Null = fall back to the computed roster count.';

-- ---------------------------------------------------------------------------
-- 2. RPC: create (re-created to accept + persist the manual member count).
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
  p_leader_pipeline_id  uuid,
  p_manual_member_count integer
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

  if p_manual_member_count is not null
     and (p_manual_member_count < 0 or p_manual_member_count > 1000) then
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
    manual_member_count, created_by, updated_by
  )
  values (
    p_group_id, p_target_year, v_status,
    coalesce(p_shepherd_willing, false), coalesce(p_needs_similar_stage, false),
    v_notes, v_successor, p_meeting_time, p_leader_pipeline_id,
    p_manual_member_count, v_actor, v_actor
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
      'has_apprentice_link', p_leader_pipeline_id is not null,
      'manual_member_count', p_manual_member_count
    ))
  );

  return v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. RPC: update (re-created to accept + persist the manual member count).
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
  p_leader_pipeline_id  uuid,
  p_manual_member_count integer
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

  if p_manual_member_count is not null
     and (p_manual_member_count < 0 or p_manual_member_count > 1000) then
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
           'has_apprentice_link', leader_pipeline_id is not null,
           'manual_member_count', manual_member_count
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
         manual_member_count = p_manual_member_count,
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
      'has_apprentice_link', p_leader_pipeline_id is not null,
      'manual_member_count', p_manual_member_count
    ))
  );

  return p_candidate_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Grants. Drop the prior 9-arg signatures (…, uuid) so callers must use the
--    new 10-arg shape (…, uuid, integer); re-grant execute to authenticated.
--    NOTE: a future migration re-creating these RPCs must thread the 10th arg.
-- ---------------------------------------------------------------------------

drop function if exists public.admin_create_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text,
  text, public.multiplication_meeting_time, uuid
);
drop function if exists public.admin_update_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text,
  text, public.multiplication_meeting_time, uuid
);

revoke all on function public.admin_create_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text,
  text, public.multiplication_meeting_time, uuid, integer
) from public, anon, authenticated;
grant execute on function public.admin_create_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text,
  text, public.multiplication_meeting_time, uuid, integer
) to authenticated;

revoke all on function public.admin_update_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text,
  text, public.multiplication_meeting_time, uuid, integer
) from public, anon, authenticated;
grant execute on function public.admin_update_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text,
  text, public.multiplication_meeting_time, uuid, integer
) to authenticated;

comment on function public.admin_create_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text,
  text, public.multiplication_meeting_time, uuid, integer
) is 'ADR 0022 admin write: adds a multiplication candidate (one active per group), including an optional same-group apprentice link and a Julian-fed manual member count. Writes a paired audit_events row.';
comment on function public.admin_update_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text,
  text, public.multiplication_meeting_time, uuid, integer
) is 'ADR 0022 admin write: updates a multiplication candidate, including its same-group apprentice link and Julian-fed manual member count. Writes a paired audit_events row.';
