-- Type-first multiplication candidates.
--
-- A multiplication candidate used to be anchored to a concrete group_id (NOT
-- NULL). The planner is now type-first: a candidate is anchored to a *cell*
-- (audience_category × category_id), and the multiplying group is optional —
-- chosen only once "Leader willing to multiply" is checked. So a candidate can
-- be tracked as a type-only watch (no group yet) and pinned to a specific group
-- of that type later.
--
-- Architecture parity with 20260608120000 / 20260531110000: additive/nullable
-- columns only; writes only via the admin_*_multiplication_candidate SECURITY
-- DEFINER RPCs (re-created here to thread the type + optional group), each
-- paired with an audit_events row; admin-only RLS unchanged; no hard deletes.

-- ---------------------------------------------------------------------------
-- 1. Additive type columns + relax group_id.
--    audience_category uses the public.group_audience_category enum (matching
--    groups.audience_category). Cell-catalog comparisons cast it ::text because
--    category_type_targets.audience_category is text (mirrors 20260611000000).
--    category_id mirrors groups.category_id (on delete set null = a removed
--    category drops the candidate to Uncategorized rather than orphaning it).
-- ---------------------------------------------------------------------------

alter table public.multiplication_candidates
  add column if not exists audience_category public.group_audience_category;
alter table public.multiplication_candidates
  add column if not exists category_id uuid
    references public.group_categories(id) on delete set null;

-- group_id becomes optional (type-only candidates carry no group). The FK and
-- its on-delete-cascade are unchanged.
alter table public.multiplication_candidates
  alter column group_id drop not null;

comment on column public.multiplication_candidates.audience_category is
  'Type-first candidates: the cell''s top type (men/women/mixed). With category_id this is the candidate''s type, independent of whether a concrete group is attached.';
comment on column public.multiplication_candidates.category_id is
  'Type-first candidates: the cell''s category (group_categories.label). With audience_category this is the candidate''s type. null = Uncategorized (legacy rows whose group had no category).';

-- ---------------------------------------------------------------------------
-- 1b. Backfill the type from each candidate's current group. Idempotent: fills
--     nulls only. Every pre-existing candidate has a group_id, so it inherits
--     that group's audience/category (some land Uncategorized — correct).
-- ---------------------------------------------------------------------------

update public.multiplication_candidates c
   set audience_category = g.audience_category,
       category_id       = g.category_id
  from public.groups g
 where c.group_id = g.id
   and c.audience_category is null
   and c.category_id is null;

-- ---------------------------------------------------------------------------
-- 1c. Uniqueness.
--     The existing partial unique index `multiplication_candidates_one_active_
--     per_group on (group_id) where archived_at is null` is intentionally left
--     as-is: Postgres treats NULLs as distinct in a unique index, so once
--     group_id is nullable it already permits many type-only (null group_id)
--     rows while still enforcing one active candidate per CONCRETE group. Do not
--     "fix" it to cover nulls.
--     Add a sibling guard so a cell has at most one active type-only watch.
-- ---------------------------------------------------------------------------

create unique index if not exists multiplication_candidates_one_active_type_only
  on public.multiplication_candidates (audience_category, category_id)
  where group_id is null and archived_at is null;

-- ---------------------------------------------------------------------------
-- 2. DB-level same-group apprentice trigger — hardened for null group_id.
--    With group_id now nullable, `v_group <> new.group_id` is NULL (not false)
--    when group_id is null, so a type-only row with a cross-group apprentice
--    would slip through. An apprentice is a same-group concept, so a link
--    without a group is rejected outright.
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
    if new.group_id is null then
      raise exception 'apprentice_requires_group';
    end if;
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

-- ---------------------------------------------------------------------------
-- 3. RPC: create (re-created to anchor on a type + an OPTIONAL group).
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
  p_manual_member_count integer,
  p_audience_category   public.group_audience_category,
  p_category_id         uuid
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
  v_group_found boolean;
  v_group_audience public.group_audience_category;
  v_group_category uuid;
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

  -- A candidate is anchored to a cell (audience × category). Both are required,
  -- and the cell must be an ACTIVE, applied (non-archived) cell — the same the
  -- Settings matrix exposes and the planner's type picker offers. This blocks a
  -- stale or tampered form persisting a candidate into an unapplied/archived
  -- cell (which the picker never offers).
  if p_audience_category is null or p_category_id is null then
    raise exception 'invalid_input';
  end if;
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

  if p_group_id is not null then
    -- A concrete group: it must exist, carry exactly the candidate's type, and
    -- not already be another active candidate's group.
    select true, audience_category, category_id
      into v_group_found, v_group_audience, v_group_category
      from public.groups where id = p_group_id for update;
    if v_group_found is null then
      raise exception 'missing_group';
    end if;
    if v_group_audience is distinct from p_audience_category
       or v_group_category is distinct from p_category_id then
      raise exception 'group_type_mismatch';
    end if;
    if exists (
      select 1 from public.multiplication_candidates
       where group_id = p_group_id and archived_at is null
    ) then
      raise exception 'candidate_exists';
    end if;

    -- Same-group guard: a linked apprentice must lead out of its own group.
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
  else
    -- Type-only watch: no group yet, so an apprentice link is meaningless, and a
    -- cell carries at most one active type-only watch.
    if p_leader_pipeline_id is not null then
      raise exception 'apprentice_requires_group';
    end if;
    if exists (
      select 1 from public.multiplication_candidates
       where group_id is null
         and audience_category = p_audience_category
         and category_id = p_category_id
         and archived_at is null
    ) then
      raise exception 'type_candidate_exists';
    end if;
  end if;

  insert into public.multiplication_candidates (
    group_id, target_year, status, shepherd_willing, needs_similar_stage,
    notes, successor_designate, meeting_time, leader_pipeline_id,
    manual_member_count, audience_category, category_id, created_by, updated_by
  )
  values (
    p_group_id, p_target_year, v_status,
    coalesce(p_shepherd_willing, false), coalesce(p_needs_similar_stage, false),
    v_notes, v_successor, p_meeting_time, p_leader_pipeline_id,
    p_manual_member_count, p_audience_category, p_category_id, v_actor, v_actor
  )
  returning id into v_new_id;

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.create_multiplication_candidate',
    'multiplication_candidates',
    v_new_id,
    jsonb_build_object('after', jsonb_build_object(
      'group_id', p_group_id, 'has_group', p_group_id is not null,
      'audience_category', p_audience_category, 'category_id', p_category_id,
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

  return v_new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. RPC: update (re-created to move cells + attach/detach a group).
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
  p_manual_member_count integer,
  p_audience_category   public.group_audience_category,
  p_category_id         uuid
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
  v_exists boolean;
  v_group_found boolean;
  v_group_audience public.group_audience_category;
  v_group_category uuid;
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

  select true, jsonb_build_object(
           'group_id', group_id, 'has_group', group_id is not null,
           'audience_category', audience_category, 'category_id', category_id,
           'target_year', target_year, 'status', status,
           'shepherd_willing', shepherd_willing,
           'needs_similar_stage', needs_similar_stage,
           'has_notes', notes is not null,
           'has_successor', successor_designate is not null,
           'meeting_time', meeting_time,
           'has_apprentice_link', leader_pipeline_id is not null,
           'manual_member_count', manual_member_count
         )
    into v_exists, v_before
    from public.multiplication_candidates
   where id = p_candidate_id and archived_at is null
   for update;

  if v_exists is null then
    raise exception 'missing_candidate';
  end if;

  -- Type required + active cell (same rule as create).
  if p_audience_category is null or p_category_id is null then
    raise exception 'invalid_input';
  end if;
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

  if p_group_id is not null then
    select true, audience_category, category_id
      into v_group_found, v_group_audience, v_group_category
      from public.groups where id = p_group_id for update;
    if v_group_found is null then
      raise exception 'missing_group';
    end if;
    if v_group_audience is distinct from p_audience_category
       or v_group_category is distinct from p_category_id then
      raise exception 'group_type_mismatch';
    end if;
    if exists (
      select 1 from public.multiplication_candidates
       where group_id = p_group_id and archived_at is null
         and id <> p_candidate_id
    ) then
      raise exception 'candidate_exists';
    end if;

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
  else
    if p_leader_pipeline_id is not null then
      raise exception 'apprentice_requires_group';
    end if;
    if exists (
      select 1 from public.multiplication_candidates
       where group_id is null
         and audience_category = p_audience_category
         and category_id = p_category_id
         and archived_at is null
         and id <> p_candidate_id
    ) then
      raise exception 'type_candidate_exists';
    end if;
  end if;

  update public.multiplication_candidates
     set group_id            = p_group_id,
         audience_category   = p_audience_category,
         category_id         = p_category_id,
         target_year         = p_target_year,
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
      'group_id', p_group_id, 'has_group', p_group_id is not null,
      'audience_category', p_audience_category, 'category_id', p_category_id,
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
-- 5. Grants. Drop the prior 10-arg signatures (…, uuid, integer) so callers
--    must use the new 12-arg shape (…, uuid, integer, group_audience_category,
--    uuid); re-grant EXECUTE to authenticated only.
--    NOTE: a future migration re-creating these RPCs must thread args 11 & 12.
-- ---------------------------------------------------------------------------

drop function if exists public.admin_create_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text,
  text, public.multiplication_meeting_time, uuid, integer
);
drop function if exists public.admin_update_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text,
  text, public.multiplication_meeting_time, uuid, integer
);

revoke all on function public.admin_create_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text,
  text, public.multiplication_meeting_time, uuid, integer,
  public.group_audience_category, uuid
) from public, anon, authenticated;
grant execute on function public.admin_create_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text,
  text, public.multiplication_meeting_time, uuid, integer,
  public.group_audience_category, uuid
) to authenticated;

revoke all on function public.admin_update_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text,
  text, public.multiplication_meeting_time, uuid, integer,
  public.group_audience_category, uuid
) from public, anon, authenticated;
grant execute on function public.admin_update_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text,
  text, public.multiplication_meeting_time, uuid, integer,
  public.group_audience_category, uuid
) to authenticated;

comment on function public.admin_create_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text,
  text, public.multiplication_meeting_time, uuid, integer,
  public.group_audience_category, uuid
) is 'Type-first admin write: adds a multiplication candidate anchored to a cell (audience × category) with an OPTIONAL multiplying group (one active per group; one active type-only watch per cell), an optional same-group apprentice link, and a Julian-fed manual member count. Writes a paired audit_events row.';
comment on function public.admin_update_multiplication_candidate(
  uuid, integer, public.multiplication_candidate_status, boolean, boolean, text,
  text, public.multiplication_meeting_time, uuid, integer,
  public.group_audience_category, uuid
) is 'Type-first admin write: updates a multiplication candidate, including moving it between cells and attaching/detaching its multiplying group + same-group apprentice link. Writes a paired audit_events row.';
