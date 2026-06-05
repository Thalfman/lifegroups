-- Interest Funnel: Prospects (ADR 0016, #375).
--
-- The pivot's Plan area is the Interest Funnel — people interested in joining a
-- group moving Interested → Matched → Joined (or parked Not at this time). This
-- supersedes the former guest pipeline (guest_pipeline_stage / the `guests`
-- table). `guests` is NOT dropped: it stays a frozen alias behind the
-- direct-URL /admin/guests route while the data is mirrored into `prospects`
-- here. The funnel state machine lives in TS (lib/admin/prospect-funnel.ts);
-- the legal-transition + invariants are re-enforced authoritatively in the
-- admin_transition_prospect RPC below.
--
-- Architecture parity with multiplication_candidates / group_health_assessments:
-- admin-only RLS read, SECURITY DEFINER write path only, paired audit_events
-- rows, no service-role writes.

-- ---------------------------------------------------------------------------
-- 1. State enum + table.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'prospect_state') then
    create type public.prospect_state as enum (
      'interested','matched','joined','not_at_this_time'
    );
  end if;
end$$;

create table if not exists public.prospects (
  id              uuid primary key default gen_random_uuid(),
  full_name       text not null,
  email           text,
  phone           text,
  state           public.prospect_state not null default 'interested',
  group_id        uuid references public.groups(id) on delete set null,
  archived        boolean not null default false,

  -- Forward-compat columns for the Next Step + note slice (#379). Created now,
  -- nullable, so #379 needs no table reshape. NOT wired into any UI yet.
  next_step       jsonb,
  additional_note text,

  created_by      uuid references public.profiles(id) on delete set null,
  updated_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- matched / joined require a group; joined is always archived. These mirror
  -- the funnel invariants in lib/admin/prospect-funnel.ts and the RPC guards.
  constraint prospects_group_required_for_matched_joined
    check (state not in ('matched','joined') or group_id is not null),
  constraint prospects_joined_is_archived
    check (state <> 'joined' or archived = true),
  constraint prospects_full_name_length
    check (char_length(full_name) <= 120),
  constraint prospects_additional_note_length
    check (additional_note is null or char_length(additional_note) <= 2000)
);

create index if not exists prospects_state_idx on public.prospects (state);
create index if not exists prospects_group_idx on public.prospects (group_id);
create index if not exists prospects_active_board_idx
  on public.prospects (state)
  where archived = false;

drop trigger if exists prospects_set_updated_at on public.prospects;
create trigger prospects_set_updated_at
  before update on public.prospects
  for each row execute function public.set_updated_at();

alter table public.prospects enable row level security;

-- Admin-only read. The Interest Funnel is a ministry-admin oversight surface.
drop policy if exists prospects_admin_read on public.prospects;
create policy prospects_admin_read
  on public.prospects
  for select to authenticated using (public.auth_is_admin());

revoke all    on public.prospects from public;
revoke all    on public.prospects from anon;
revoke all    on public.prospects from authenticated;
grant  select on public.prospects to authenticated;

comment on table public.prospects is
  'Interest Funnel Prospects (#375): people moving Interested → Matched → Joined (or parked Not at this time). Admin-only RLS; writes only via admin_create_prospect / admin_transition_prospect. next_step + additional_note are reserved for #379. Supersedes the frozen guests pipeline.';

-- ---------------------------------------------------------------------------
-- 2. Data migration: mirror guests → prospects (acceptance #1).
-- ---------------------------------------------------------------------------
--
-- Mapping (mirrors mapGuestStageToProspectState in lib/admin/prospect-funnel.ts):
--   new / contacted / interested / attended → interested
--   assigned                                → matched   (carry assigned_group_id)
--   placed                                  → joined     (carry assigned_group_id, archived)
--   not_now                                 → not_at_this_time
-- guests stays intact (frozen alias). Guarded so a re-run does not duplicate.

insert into public.prospects (
  full_name, email, phone, state, group_id, archived, created_by, updated_by,
  created_at, updated_at
)
select
  g.full_name,
  g.email,
  g.phone,
  -- assigned/placed only become matched/joined when they actually carry a group
  -- (the prospects_group_required_for_matched_joined CHECK). A group-less
  -- assigned/placed guest — e.g. a guest staged 'assigned' before a group was
  -- chosen — falls back to interested rather than failing the whole data load.
  case
    when g.pipeline_stage = 'assigned' and g.assigned_group_id is not null then 'matched'::public.prospect_state
    when g.pipeline_stage = 'placed'   and g.assigned_group_id is not null then 'joined'::public.prospect_state
    when g.pipeline_stage = 'not_now'  then 'not_at_this_time'::public.prospect_state
    else 'interested'::public.prospect_state
  end as state,
  case
    when g.pipeline_stage in ('assigned','placed') then g.assigned_group_id
    else null
  end as group_id,
  (g.pipeline_stage = 'placed' and g.assigned_group_id is not null) as archived,
  null::uuid,
  null::uuid,
  g.created_at,
  g.updated_at
from public.guests g
where not exists (select 1 from public.prospects);

-- ---------------------------------------------------------------------------
-- 3. RPC: create a Prospect (always lands in 'interested', no group).
-- ---------------------------------------------------------------------------

create or replace function public.admin_create_prospect(
  p_full_name text,
  p_email     text,
  p_phone     text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_name  text;
  v_email text;
  v_phone text;
  v_id    uuid;
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

  insert into public.prospects (
    full_name, email, phone, state, created_by, updated_by
  )
  values (
    v_name, v_email, v_phone, 'interested', v_actor, v_actor
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
      'state', 'interested'
    )
  );

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. RPC: transition a Prospect's state (the authoritative funnel gate).
-- ---------------------------------------------------------------------------
--
-- Enforces, in SQL, the same rules as lib/admin/prospect-funnel.ts: legal
-- edges only, matched/joined require a group, joined archives. Rejects with the
-- fixed tokens illegal_transition / group_required / missing_prospect so the
-- action layer maps a stable, user-facing message regardless of which check
-- fired. A null p_group_id carries forward the Prospect's current group.

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
  v_actor    uuid;
  v_from     public.prospect_state;
  v_cur_grp  uuid;
  v_grp      uuid;
  v_archived boolean;
  v_legal    boolean;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;
  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  select state, group_id into v_from, v_cur_grp
    from public.prospects
   where id = p_prospect_id
   for update;
  if v_from is null then
    raise exception 'missing_prospect';
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

-- ---------------------------------------------------------------------------
-- 5. Grants.
-- ---------------------------------------------------------------------------

revoke all on function public.admin_create_prospect(text, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_create_prospect(text, text, text)
  to authenticated;

revoke all on function public.admin_transition_prospect(uuid, public.prospect_state, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_transition_prospect(uuid, public.prospect_state, uuid)
  to authenticated;

comment on function public.admin_create_prospect(text, text, text) is
  'Interest Funnel (#375): creates a Prospect in the interested state. Writes a paired audit_events row.';
comment on function public.admin_transition_prospect(uuid, public.prospect_state, uuid) is
  'Interest Funnel (#375): transitions a Prospect''s state, enforcing legal edges + group-required + joined-archives. Rejects with illegal_transition / group_required / missing_prospect. Writes a paired audit_events row.';
