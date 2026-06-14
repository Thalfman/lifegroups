-- Reviewer / demo seed (mobile store roadmap §6, #572).
--
-- A fully SYNTHETIC dataset that fills the Ministry Admin, Over-Shepherd, and
-- Leader surfaces so app-store reviewers see meaningful, non-empty workflows. It
-- reuses the existing supabase/seed/ convention (idempotent SQL, @example data),
-- and contains NO real ministry / pastoral content — every name is invented and
-- every email is @reviewerdemo.example.
--
-- Scope split with #564: THIS seed creates the records (Cells, Groups, People,
-- Leaders, Over-Shepherds, Care Notes, Prayer Requests). #564 stands up the
-- review environment and provisions the reviewer AUTH users; those Auth users
-- link to the profiles below BY EMAIL (the over-shepherd bridge and the leader
-- assignments key off these emails), so the reviewer logins land on populated
-- surfaces.
--
-- Reviewer login emails this seed expects #564 to provision:
--   reviewer.admin@reviewerdemo.example         (Ministry Admin)
--   reviewer.overshepherd@reviewerdemo.example  (Over-Shepherd)
--   reviewer.leader@reviewerdemo.example         (Leader)
--
-- Properties:
--   * Idempotent / re-runnable — every insert is guarded (ON CONFLICT / NOT
--     EXISTS), so a second run is a no-op.
--   * Env-agnostic — plain DML with no project ids; run it against whatever
--     Supabase target #564 selects.
--   * Respects the write guardrails — pure INSERTs only. It adds NO policies,
--     uses NO service-role key, enables NO RLS, and performs NO hard deletes.
--
-- How to run (same as the other supabase/seed/*.sql files): apply it through the
-- Supabase SQL editor, `supabase db push`, or
--   psql "$DATABASE_URL" -f supabase/seed/reviewer_demo_seed.sql
-- against the chosen demo project.

begin;

-- 1. Category catalog -------------------------------------------------------
insert into public.group_categories (label)
select v.label
from (values ('20s-30s'), ('Young families'), ('50s+')) as v(label)
where not exists (
  select 1
    from public.group_categories gc
   where lower(btrim(gc.label)) = lower(btrim(v.label))
     and gc.archived_at is null
);

-- 2. Cells (audience x category) --------------------------------------------
insert into public.category_type_targets (audience_category, category_id, active, target_count)
select v.audience, gc.id, true, v.target
from (values
  ('men', '20s-30s', 2),
  ('women', '20s-30s', 2),
  ('mixed', 'Young families', 1),
  ('men', '50s+', 1),
  ('women', 'Young families', 1)
) as v(audience, label, target)
join public.group_categories gc
  on lower(btrim(gc.label)) = lower(btrim(v.label))
 and gc.archived_at is null
on conflict (audience_category, category_id) do nothing;

-- 3. Groups -----------------------------------------------------------------
insert into public.groups (
  name, description, meeting_day, meeting_time, location_area, capacity,
  lifecycle_status, health_status, audience_category, category_id, admin_notes
)
select
  v.name, v.description, v.day, v.mtime::time, v.area, v.cap,
  v.lifecycle::public.group_lifecycle_status,
  v.health::public.group_health_status,
  v.audience::public.group_audience_category,
  gc.id,
  'Synthetic reviewer demo data (#572).'
from (values
  ('FVC Demo - Tuesday Men', 'Demo discipleship group', 'Tuesday', '19:00', 'North', 16, 'active', 'healthy', 'men', '20s-30s'),
  ('FVC Demo - Wednesday Women', 'Demo discipleship group', 'Wednesday', '18:30', 'West', 18, 'active', 'watch', 'women', '20s-30s'),
  ('FVC Demo - Thursday Mixed', 'Demo family group', 'Thursday', '18:00', 'Central', 20, 'active', 'healthy', 'mixed', 'Young families'),
  ('FVC Demo - Sunday Men', 'Demo group', 'Sunday', '17:00', 'East', 14, 'active', 'needs_follow_up', 'men', '50s+'),
  ('FVC Demo - Friday Women', 'Demo group', 'Friday', '10:00', 'South', 16, 'active', 'healthy', 'women', 'Young families')
) as v(name, description, day, mtime, area, cap, lifecycle, health, audience, label)
left join public.group_categories gc
  on lower(btrim(gc.label)) = lower(btrim(v.label))
 and gc.archived_at is null
where not exists (
  select 1 from public.groups g where g.name = v.name
);

-- 4. Profiles (login accounts; auth_user_id linked later by #564) -----------
insert into public.profiles (full_name, email, phone, role, status, full_name_pending)
select v.full_name, v.email, null, v.role::public.user_role,
       'active'::public.profile_status, false
from (values
  ('Reviewer Demo Admin', 'reviewer.admin@reviewerdemo.example', 'ministry_admin'),
  ('Reviewer Demo Over-Shepherd', 'reviewer.overshepherd@reviewerdemo.example', 'over_shepherd'),
  ('Reviewer Demo Leader', 'reviewer.leader@reviewerdemo.example', 'leader'),
  ('Demo Leader Bri', 'demo.leader.bri@reviewerdemo.example', 'leader'),
  ('Demo Leader Sam', 'demo.leader.sam@reviewerdemo.example', 'leader'),
  ('Demo Leader Noor', 'demo.leader.noor@reviewerdemo.example', 'leader')
) as v(full_name, email, role)
on conflict (email) do nothing;

-- 5. Leader assignments -----------------------------------------------------
insert into public.group_leaders (group_id, profile_id, role)
select g.id, p.id, 'leader'::public.role_in_group
from (values
  ('FVC Demo - Tuesday Men', 'reviewer.leader@reviewerdemo.example'),
  ('FVC Demo - Friday Women', 'reviewer.leader@reviewerdemo.example'),
  ('FVC Demo - Wednesday Women', 'demo.leader.bri@reviewerdemo.example'),
  ('FVC Demo - Thursday Mixed', 'demo.leader.sam@reviewerdemo.example'),
  ('FVC Demo - Sunday Men', 'demo.leader.noor@reviewerdemo.example')
) as v(group_name, email)
join public.groups g on g.name = v.group_name
join public.profiles p on p.email = v.email
on conflict (group_id, profile_id, role) do nothing;

-- 6. Members ----------------------------------------------------------------
insert into public.members (full_name, email, household_name, status)
select
  'Demo Member ' || lpad(gs::text, 2, '0'),
  'demo.member.' || gs || '@reviewerdemo.example',
  'Demo Household ' || ((gs % 6) + 1),
  'active'::public.membership_status
from generate_series(1, 18) gs
where not exists (
  select 1 from public.members m
   where m.email = 'demo.member.' || gs || '@reviewerdemo.example'
);

-- 7. Group memberships (round-robin members across the demo groups) ----------
insert into public.group_memberships (group_id, member_id)
select g.id, m.id
from (
  select id, row_number() over (order by email) as rn
    from public.members
   where email like 'demo.member.%@reviewerdemo.example'
) m
join (
  select id, row_number() over (order by name) as rn
    from public.groups
   where name like 'FVC Demo - %'
) g on ((m.rn - 1) % 5) + 1 = g.rn
on conflict (group_id, member_id) do nothing;

-- 8. Over-Shepherd directory row (email matches the OS login for the bridge) -
insert into public.over_shepherds (full_name, email, active, notes)
select 'Reviewer Demo Over-Shepherd', 'reviewer.overshepherd@reviewerdemo.example',
       true, 'Synthetic reviewer demo data (#572).'
where not exists (
  select 1 from public.over_shepherds os
   where lower(btrim(os.email)) = 'reviewer.overshepherd@reviewerdemo.example'
);

-- 9. Coverage assignments (the OS covers the four demo leaders) --------------
insert into public.shepherd_coverage_assignments (shepherd_profile_id, over_shepherd_id, active)
select p.id, os.id, true
from public.profiles p
cross join lateral (
  select id from public.over_shepherds
   where lower(btrim(email)) = 'reviewer.overshepherd@reviewerdemo.example'
     and active
   limit 1
) os
where p.email in (
  'reviewer.leader@reviewerdemo.example',
  'demo.leader.bri@reviewerdemo.example',
  'demo.leader.sam@reviewerdemo.example',
  'demo.leader.noor@reviewerdemo.example'
)
and not exists (
  select 1 from public.shepherd_coverage_assignments sca
   where sca.shepherd_profile_id = p.id and sca.active
);

-- 10. Care Notes -------------------------------------------------------------
-- Over-Shepherd notes ABOUT leaders (subject = leader profile).
insert into public.care_notes (author_profile_id, subject_profile_id, body)
select a.id, s.id, v.body
from (values
  ('reviewer.leader@reviewerdemo.example', 'Checked in after Tuesday - encouraged; momentum is good.'),
  ('demo.leader.bri@reviewerdemo.example', 'Wednesday group is steady; Bri asked about adding a co-leader.'),
  ('demo.leader.sam@reviewerdemo.example', 'Sam is stretched thin this month; following up next week.')
) as v(subject_email, body)
join public.profiles a on a.email = 'reviewer.overshepherd@reviewerdemo.example'
join public.profiles s on s.email = v.subject_email
where not exists (
  select 1 from public.care_notes cn
   where cn.author_profile_id = a.id
     and cn.subject_profile_id = s.id
     and cn.body = v.body
);

-- Leader note ABOUT their own group (subject = group).
insert into public.care_notes (author_profile_id, subject_group_id, body)
select a.id, g.id, 'Group is gelling - two newcomers last week; planning a social.'
from public.profiles a
join public.groups g on g.name = 'FVC Demo - Tuesday Men'
where a.email = 'reviewer.leader@reviewerdemo.example'
and not exists (
  select 1 from public.care_notes cn
   where cn.author_profile_id = a.id
     and cn.subject_group_id = g.id
     and cn.body = 'Group is gelling - two newcomers last week; planning a social.'
);

-- 11. Prayer Requests --------------------------------------------------------
insert into public.prayer_requests (author_profile_id, subject_profile_id, body, status)
select a.id, s.id, 'Pray for Noor''s family this season.', 'open'
from public.profiles a
join public.profiles s on s.email = 'demo.leader.noor@reviewerdemo.example'
where a.email = 'reviewer.overshepherd@reviewerdemo.example'
and not exists (
  select 1 from public.prayer_requests pr
   where pr.author_profile_id = a.id
     and pr.subject_profile_id = s.id
     and pr.body = 'Pray for Noor''s family this season.'
);

insert into public.prayer_requests (author_profile_id, subject_group_id, body, status)
select a.id, g.id, 'Pray our new study lands well with the group.', 'open'
from public.profiles a
join public.groups g on g.name = 'FVC Demo - Friday Women'
where a.email = 'reviewer.leader@reviewerdemo.example'
and not exists (
  select 1 from public.prayer_requests pr
   where pr.author_profile_id = a.id
     and pr.subject_group_id = g.id
     and pr.body = 'Pray our new study lands well with the group.'
);

commit;
