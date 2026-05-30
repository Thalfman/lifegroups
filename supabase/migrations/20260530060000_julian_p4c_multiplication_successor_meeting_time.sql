-- Julian #143 (P4c): capture the two Google-Doc fields the multiplication
-- pipeline doesn't yet model — the successor/leader-designate and the
-- meeting-time option.
--
-- NOTE: re-versioned 20260530030000 -> 20260530060000. This file originally
-- shared version 20260530030000 with julian_q2_shepherd_care_status_five.
-- Two migrations cannot share a version: q2 claimed the 20260530030000 slot in
-- schema_migrations, so this migration was silently skipped on deploy (its
-- columns/type/RPCs never reached the database). Renumbering to a unique,
-- later version lets it apply as a fresh pending migration while leaving q2's
-- already-recorded 20260530030000 entry untouched (re-running q2 would re-fire
-- its `rename value 'healthy'`, which now errors because the rename is done).
-- All steps below are guarded (if-not-exists / drop-if-exists), so applying
-- them now is safe.
--
-- Both are additive and nullable: existing multiplication_candidates rows stay
-- valid, no reshape of the table.
--
--   * successor_designate : the Doc's second `(Name)` (e.g. `(Tony L.)`) — the
--     apprentice/leader intended to carry the multiplied group. This is a
--     net-new, manually-entered designation. It is DISTINCT from the derived
--     co-shepherd tenure signal (group_leaders.assigned_at) that feeds the
--     readiness criterion, and it does NOT feed readiness.
--   * meeting_time        : `during the day` / `evening`, so the planner can
--     honour the Doc's "two options per person" goal.
--
-- Architecture parity with migration 20260528160000: admin-only RLS read,
-- writes only via the existing admin_*_multiplication_candidate SECURITY
-- DEFINER RPCs (re-created below to thread the two fields), each paired with an
-- audit_events row; no new write RLS; no hard deletes.

-- ---------------------------------------------------------------------------
-- 1. Meeting-time enum.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'multiplication_meeting_time') then
    create type public.multiplication_meeting_time as enum (
      'during_the_day','evening'
    );
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 2. Additive, nullable columns + a guarded length bound on the successor.
-- ---------------------------------------------------------------------------

alter table public.multiplication_candidates
  add column if not exists successor_designate text;
alter table public.multiplication_candidates
  add column if not exists meeting_time public.multiplication_meeting_time;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'multiplication_candidates_successor_length'
  ) then
    alter table public.multiplication_candidates
      add constraint multiplication_candidates_successor_length
      check (successor_designate is null or char_length(successor_designate) <= 120);
  end if;
end$$;

comment on column public.multiplication_candidates.successor_designate is
  'Julian #143: apprentice/leader intended to carry the multiplied group (the Doc''s second (Name)). Manually entered; distinct from the derived co-shepherd tenure signal and does not feed readiness.';
comment on column public.multiplication_candidates.meeting_time is
  'Julian #143: during_the_day | evening. Surfaces the Doc''s meeting-time option for the "two options per person" goal.';

-- ---------------------------------------------------------------------------
-- 3. RPC: create (re-created to accept + persist the two new fields).
-- ---------------------------------------------------------------------------

create or replace function public.admin_create_multiplication_candidate(
  p_group_id            uuid,
  p_target_year         integer,
  p_status              public.multiplication_candidate_status,
  p_shepherd_willing    boolean,
  p_needs_similar_stage boolean,
  p_notes               text,
  p_successor_designate text,
  p_meeting_time        public.multiplication_meeting_time
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

  if exists (
    select 1 from public.multiplication_candidates
     where group_id = p_group_id and archived_at is null
  ) then
    raise exception 'candidate_exists';
  end if;

  insert into public.multiplication_candidates (
    group_id, target_year, status, shepherd_willing, needs_similar_stage,
    notes, successor_designate, meeting_time, created_by, updated_by
  )
  values (
    p_group_id, p_target_year, v_status,
    coalesce(p_shepherd_willing, false), coalesce(p_needs_similar_stage, false),
    v_notes, v_successor, p_meeting_time, v_actor, v_actor
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
      'meeting_time', p_meeting_time
    ))
  );

  return v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. RPC: update (re-created to accept + persist the two new fields).
-- ---------------------------------------------------------------------------

create or replace function public.admin_update_multiplication_candidate(
  p_candidate_id        uuid,
  p_target_year         integer,
  p_status              public.multiplication_candidate_status,
  p_shepherd_willing    boolean,
  p_needs_similar_stage boolean,
  p_notes               text,
  p_successor_designate text,
  p_meeting_time        public.multiplication_meeting_time
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

  select jsonb_build_object(
           'target_year', target_year, 'status', status,
           'shepherd_willing', shepherd_willing,
           'needs_similar_stage', needs_similar_stage,
           'has_notes', notes is not null,
           'has_successor', successor_designate is not null,
           'meeting_time', meeting_time
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
         successor_designate = v_successor,
         meeting_time        = p_meeting_time,
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
      'meeting_time', p_meeting_time
    ))
  );

  return p_candidate_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Grants. The old 6-arg signatures are dropped so callers must use the new
--    8-arg shape; the new functions re-grant execute to authenticated only.
-- ---------------------------------------------------------------------------

drop function if exists public.admin_create_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text
);
drop function if exists public.admin_update_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text
);

revoke all on function public.admin_create_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text,
  text, public.multiplication_meeting_time
) from public, anon, authenticated;
grant execute on function public.admin_create_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text,
  text, public.multiplication_meeting_time
) to authenticated;

revoke all on function public.admin_update_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text,
  text, public.multiplication_meeting_time
) from public, anon, authenticated;
grant execute on function public.admin_update_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text,
  text, public.multiplication_meeting_time
) to authenticated;

comment on function public.admin_create_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text,
  text, public.multiplication_meeting_time
) is 'Julian #143 admin write: adds a multiplication candidate (one active per group), including successor/leader-designate and meeting time. Writes a paired audit_events row.';
comment on function public.admin_update_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text,
  text, public.multiplication_meeting_time
) is 'Julian #143 admin write: updates a multiplication candidate''s fields, including successor/leader-designate and meeting time. Writes a paired audit_events row.';
