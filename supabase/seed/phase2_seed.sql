with inserted_profiles as (
  insert into profiles (full_name, email, phone, role, status)
  values
    ('Avery Bennett','avery.bennett@example.org','555-0101','ministry_admin','active'),
    ('Jordan Hayes','jordan.hayes@example.org','555-0102','co_leader','active'),
    ('Casey Morgan','casey.morgan@example.org','555-0103','leader','active'),
    ('Riley Cruz','riley.cruz@example.org','555-0104','leader','active'),
    ('Taylor Kim','taylor.kim@example.org','555-0105','leader','active')
  returning id, full_name
), inserted_groups as (
  insert into groups (name, description, meeting_day, meeting_time, location_area, capacity, lifecycle_status, health_status, pause_reason, pause_start_date, expected_return_date, restart_reminder_date, admin_notes)
  values
    ('Northside Young Adults','Community and discipleship for young adults','Tuesday','19:00','North Campus',18,'active','healthy',null,null,null,null,'Steady participation and healthy volunteer rhythm.'),
    ('Westside Families','Family-centered Bible study','Wednesday','18:30','West Campus',22,'active','watch',null,null,null,null,'Track attendance variance this month.'),
    ('Downtown Professionals','Lunch-hour study for professionals','Thursday','12:00','Downtown',14,'active','capacity_full',null,null,null,null,'Waitlist forming; monitor launch of second table.'),
    ('South Campus Women','Women life group with semester rhythm','Monday','19:00','South Campus',20,'planned_pause','healthy_paused','Summer pause','2026-05-01','2026-08-15','2026-08-01','Planned seasonal pause with restart prep.'),
    ('Eastside Community','Neighborhood outreach and study','Sunday','17:00','Eastside',16,'active','needs_follow_up',null,null,null,null,'Leader requested coaching on retention.')
  returning id, name
), map as (
  select g.id as group_id, g.name, p.id as profile_id
  from inserted_groups g
  join inserted_profiles p on (
    (g.name='Northside Young Adults' and p.full_name='Casey Morgan') or
    (g.name='Westside Families' and p.full_name='Riley Cruz') or
    (g.name='Downtown Professionals' and p.full_name='Taylor Kim') or
    (g.name='South Campus Women' and p.full_name='Casey Morgan') or
    (g.name='Eastside Community' and p.full_name='Riley Cruz')
  )
)
insert into group_leaders (group_id, profile_id, role)
select group_id, profile_id, 'leader'::role_in_group from map;

insert into members (full_name, email, phone, household_name, status)
select
  'Member ' || lpad(gs::text, 2, '0'),
  'member' || gs || '@example.org',
  '555-' || lpad((2000 + gs)::text, 4, '0'),
  'Household ' || ((gs % 12) + 1),
  case when gs % 17 = 0 then 'paused'::membership_status else 'active'::membership_status end
from generate_series(1, 40) gs;

with g as (select id, row_number() over(order by name) as rn from groups),
m as (select id, row_number() over(order by full_name) as rn from members)
insert into group_memberships (group_id, member_id, role, status)
select g.id, m.id, 'member', 'active'
from m
join g on ((m.rn - 1) % 5) + 1 = g.rn;

with weeks as (
  select unnest(array['2026-04-20'::date,'2026-04-27'::date,'2026-05-04'::date,'2026-05-11'::date]) as meeting_week
)
insert into attendance_sessions (group_id, meeting_week, meeting_date, status, leader_note)
select g.id, w.meeting_week, w.meeting_week + 1,
  case when g.lifecycle_status='planned_pause' then 'planned_pause'::attendance_session_status else 'submitted'::attendance_session_status end,
  'Weekly check-in entered for dashboard preview.'
from groups g cross join weeks w;

insert into attendance_records (session_id, member_id, attendance_status)
select s.id, gm.member_id,
  case when random() < 0.78 then 'present'::attendance_status when random() < 0.9 then 'absent'::attendance_status else 'excused'::attendance_status end
from attendance_sessions s
join group_memberships gm on gm.group_id = s.group_id;

insert into guests (full_name, email, phone, pipeline_stage, notes)
values
  ('Skyler Dawson','skyler.dawson@example.org','555-1201','new','Requested first-time follow-up call.'),
  ('Harper Ellis','harper.ellis@example.org','555-1202','contacted','Initial text sent; awaiting response.'),
  ('Rowan Blake','rowan.blake@example.org','555-1203','interested','Interested in family-friendly group options.'),
  ('Quinn Parker','quinn.parker@example.org','555-1204','assigned','Assigned to Westside Families introduction.'),
  ('Logan Reese','logan.reese@example.org','555-1205','attended','Attended two sessions and asked for next steps.'),
  ('Emerson Lake','emerson.lake@example.org','555-1206','placed','Placed into Northside Young Adults.'),
  ('Peyton Sloan','peyton.sloan@example.org','555-1207','not_now','Asked to reconnect in 6 weeks.');

insert into follow_ups (type, title, priority, due_date, status, leader_visible_note)
values
  ('attendance','Review low attendance trend for Eastside','high','2026-05-20','open','Confirm member check-ins this week.'),
  ('capacity','Prepare second table plan for Downtown','high','2026-05-24','in_progress','Identify apprentice co-leader.'),
  ('pause','Confirm South Campus restart communication','normal','2026-07-25','open','Draft August restart reminder.'),
  ('guest','Call Skyler Dawson','normal','2026-05-18','open','Warm welcome and answer schedule questions.'),
  ('guest','Send intro message to Rowan Blake','normal','2026-05-19','done','Sent list of nearby groups.'),
  ('leader','Schedule coaching with Eastside leader','high','2026-05-22','in_progress','Cover member retention playbook.'),
  ('admin','Validate Q2 group roster accuracy','low','2026-05-31','snoozed','Complete after attendance import.'),
  ('care','General care follow-up for paused members','normal','2026-05-28','open','Use neutral pastoral care check-in language.');

insert into group_health_updates (group_id, update_week, pulse, follow_up_needed, leader_note)
select id, '2026-05-04', health_status, health_status in ('watch','needs_follow_up','capacity_full','needs_leader_support'), 'Weekly pulse update for dashboard.'
from groups
where name in ('Westside Families','Downtown Professionals','Eastside Community');
