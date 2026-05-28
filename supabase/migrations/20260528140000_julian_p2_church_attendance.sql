-- Julian feedback P2: church-attendance capture for participation %.
--
-- Julian's systems conversation (answer 9): people-in-groups is the primary
-- metric, but church attendance is "extremely important" as the denominator
-- ("if 100 attend the church and 80 are in a life group, that's 80%"). He has
-- no reliable way to capture church numbers yet.
--
-- This migration records church attendance as a dated time series so the
-- "% of the church in a life group" headline can trend, instead of relying
-- on a single overwritten planning assumption. The launch-planning forecast
-- assumption (app_settings.launch_planning_assumptions.current_church_attendance)
-- is untouched and remains the planning baseline; these snapshots are the
-- record of *actual* counts.
--
-- Architecture parity: admin-only RLS read, SECURITY DEFINER write path only,
-- paired audit_events row in the same transaction, no hard deletes.

-- ---------------------------------------------------------------------------
-- 1. church_attendance_snapshots table. One row per date (upsert by date).
-- ---------------------------------------------------------------------------

create table if not exists public.church_attendance_snapshots (
  id                    uuid primary key default gen_random_uuid(),
  snapshot_date         date not null unique,
  attendance_count      integer not null,
  note                  text,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint church_attendance_snapshots_count_bounds
    check (attendance_count between 0 and 1000000),
  constraint church_attendance_snapshots_note_length
    check (note is null or char_length(note) <= 1000)
);

create index if not exists church_attendance_snapshots_date_idx
  on public.church_attendance_snapshots (snapshot_date desc);

drop trigger if exists church_attendance_snapshots_set_updated_at
  on public.church_attendance_snapshots;
create trigger church_attendance_snapshots_set_updated_at
  before update on public.church_attendance_snapshots
  for each row execute function public.set_updated_at();

alter table public.church_attendance_snapshots enable row level security;

drop policy if exists church_attendance_snapshots_admin_read
  on public.church_attendance_snapshots;
create policy church_attendance_snapshots_admin_read
  on public.church_attendance_snapshots
  for select to authenticated using (public.auth_is_admin());

revoke all    on public.church_attendance_snapshots from public;
revoke all    on public.church_attendance_snapshots from anon;
revoke all    on public.church_attendance_snapshots from authenticated;
grant  select on public.church_attendance_snapshots to authenticated;

comment on table public.church_attendance_snapshots is
  'Julian P2: dated record of overall church attendance, the denominator for "% of the church in a life group". Admin-only RLS; writes only via admin_record_church_attendance_snapshot.';

-- ---------------------------------------------------------------------------
-- 2. RPC: admin_record_church_attendance_snapshot. Upserts by snapshot_date.
-- ---------------------------------------------------------------------------

create or replace function public.admin_record_church_attendance_snapshot(
  p_snapshot_date    date,
  p_attendance_count integer,
  p_note             text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_note text;
  v_row_id uuid;
  v_before jsonb;
  v_after jsonb;
begin
  if not public.auth_is_admin() then
    raise exception 'insufficient_privilege';
  end if;

  v_actor := public.auth_profile_id();
  if v_actor is null then
    raise exception 'insufficient_privilege';
  end if;

  if p_snapshot_date is null then
    raise exception 'invalid_input';
  end if;
  if p_attendance_count is null
     or p_attendance_count < 0 or p_attendance_count > 1000000 then
    raise exception 'invalid_input';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'invalid_input';
  end if;

  select id,
         jsonb_build_object(
           'snapshot_date', snapshot_date,
           'attendance_count', attendance_count,
           'note', note
         )
    into v_row_id, v_before
    from public.church_attendance_snapshots
   where snapshot_date = p_snapshot_date
   for update;

  insert into public.church_attendance_snapshots (
    snapshot_date, attendance_count, note, created_by_profile_id
  )
  values (p_snapshot_date, p_attendance_count, v_note, v_actor)
  on conflict (snapshot_date) do update
    set attendance_count = excluded.attendance_count,
        note             = excluded.note
  returning id into v_row_id;

  v_after := jsonb_build_object(
    'snapshot_date', p_snapshot_date,
    'attendance_count', p_attendance_count,
    'note', v_note
  );

  insert into public.audit_events (actor_profile_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'admin.record_church_attendance_snapshot',
    'church_attendance_snapshots',
    v_row_id,
    jsonb_build_object(
      'before', coalesce(v_before, jsonb_build_object()),
      'after',  v_after
    )
  );

  return v_row_id;
end;
$$;

revoke all on function public.admin_record_church_attendance_snapshot(date, integer, text) from public;
revoke all on function public.admin_record_church_attendance_snapshot(date, integer, text) from anon;
revoke all on function public.admin_record_church_attendance_snapshot(date, integer, text) from authenticated;
grant  execute on function public.admin_record_church_attendance_snapshot(date, integer, text) to authenticated;

comment on function public.admin_record_church_attendance_snapshot(date, integer, text) is
  'Julian P2 admin write: upserts a church_attendance_snapshots row by date and writes a paired audit_events row.';
