-- ARCH-6 (2026-07-11 audit): return each requested group's recent attendance
-- window in one RLS-respecting read. The previous overview issued two queries
-- per active group (sessions, then records), so request count grew with the
-- number of groups.

create or replace function public.admin_group_health_attendance_weeks(
  p_group_ids uuid[],
  p_limit_weeks integer
)
returns table (
  group_id uuid,
  session_id uuid,
  meeting_week date,
  present bigint,
  absent bigint,
  excused bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with ranked_sessions as (
    select
      s.id,
      s.group_id,
      s.meeting_week,
      row_number() over (
        partition by s.group_id
        order by s.meeting_week desc, s.id desc
      ) as group_rank
    from public.attendance_sessions as s
    where s.group_id = any(coalesce(p_group_ids, array[]::uuid[]))
  ),
  selected_sessions as (
    select id, group_id, meeting_week
    from ranked_sessions
    where group_rank <= greatest(1, least(coalesce(p_limit_weeks, 8), 52))
  )
  select
    s.group_id,
    s.id as session_id,
    s.meeting_week,
    count(r.id) filter (where r.attendance_status = 'present') as present,
    count(r.id) filter (where r.attendance_status = 'absent') as absent,
    count(r.id) filter (where r.attendance_status = 'excused') as excused
  from selected_sessions as s
  left join public.attendance_records as r on r.session_id = s.id
  group by s.group_id, s.id, s.meeting_week
  order by s.group_id, s.meeting_week desc, s.id desc;
$$;

revoke all on function public.admin_group_health_attendance_weeks(uuid[], integer)
  from public, anon;
grant execute on function public.admin_group_health_attendance_weeks(uuid[], integer)
  to authenticated;
