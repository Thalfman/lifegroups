-- Julian #144: multiplication planner seed.
--
-- GENERATED FILE — do not edit by hand. Regenerate with:
--   npx tsx scripts/generate-multiplication-seed.ts
-- Source of truth: lib/admin/multiplication-seed.ts, transcribing
-- docs/julian-inputs/LG_MULTIPLICATION_PLAN_2026.md (left in place as the
-- provenance record per ADR 0006). A drift guard test pins this file to the
-- module output.
--
-- Run after the schema + segmentation + pipeline migrations, like
-- supabase/seed/phase2_seed.sql. Idempotent: groups insert only when absent;
-- candidates insert only when the group has no active (non-archived)
-- candidate, so re-running never duplicates an active candidate. No hard
-- deletes. target_year is intentionally null — Julian sets the 2026/2027 split
-- in-app (ADR 0006 / R4).

-- George Kelly (men / multi_generational)
insert into public.groups (name, audience_category, life_stage)
select 'George Kelly', 'men'::public.group_audience_category, 'multi_generational'::public.group_life_stage
where not exists (select 1 from public.groups where name = 'George Kelly');

insert into public.multiplication_candidates (
  group_id, target_year, status, shepherd_willing, needs_similar_stage,
  notes, successor_designate, meeting_time
)
select g.id, null, 'watching'::public.multiplication_candidate_status, false, false,
  'Doc: 9 members at time of plan. Doc bracket: Men''s "50''s – 60''s".', null, null
from public.groups g
where g.name = 'George Kelly'
  and not exists (
    select 1 from public.multiplication_candidates c
    where c.group_id = g.id and c.archived_at is null
  );

-- Tim Boberg (men / multi_generational)
insert into public.groups (name, audience_category, life_stage)
select 'Tim Boberg', 'men'::public.group_audience_category, 'multi_generational'::public.group_life_stage
where not exists (select 1 from public.groups where name = 'Tim Boberg');

insert into public.multiplication_candidates (
  group_id, target_year, status, shepherd_willing, needs_similar_stage,
  notes, successor_designate, meeting_time
)
select g.id, null, 'watching'::public.multiplication_candidate_status, false, false,
  'Doc: 13 members at time of plan. Doc bracket: Men''s "60''s – 70''s".', null, null
from public.groups g
where g.name = 'Tim Boberg'
  and not exists (
    select 1 from public.multiplication_candidates c
    where c.group_id = g.id and c.archived_at is null
  );

-- Nate Baron (men / multi_generational)
insert into public.groups (name, audience_category, life_stage)
select 'Nate Baron', 'men'::public.group_audience_category, 'multi_generational'::public.group_life_stage
where not exists (select 1 from public.groups where name = 'Nate Baron');

insert into public.multiplication_candidates (
  group_id, target_year, status, shepherd_willing, needs_similar_stage,
  notes, successor_designate, meeting_time
)
select g.id, null, 'watching'::public.multiplication_candidate_status, false, false,
  'Doc: 10 members at time of plan.', 'Tony L.', null
from public.groups g
where g.name = 'Nate Baron'
  and not exists (
    select 1 from public.multiplication_candidates c
    where c.group_id = g.id and c.archived_at is null
  );

-- Mike Irizarry (men / multi_generational)
insert into public.groups (name, audience_category, life_stage)
select 'Mike Irizarry', 'men'::public.group_audience_category, 'multi_generational'::public.group_life_stage
where not exists (select 1 from public.groups where name = 'Mike Irizarry');

insert into public.multiplication_candidates (
  group_id, target_year, status, shepherd_willing, needs_similar_stage,
  notes, successor_designate, meeting_time
)
select g.id, null, 'watching'::public.multiplication_candidate_status, false, false,
  'Doc: 15 members at time of plan.', 'Jon H.', null
from public.groups g
where g.name = 'Mike Irizarry'
  and not exists (
    select 1 from public.multiplication_candidates c
    where c.group_id = g.id and c.archived_at is null
  );

-- George Diamond (men / multi_generational)
insert into public.groups (name, audience_category, life_stage)
select 'George Diamond', 'men'::public.group_audience_category, 'multi_generational'::public.group_life_stage
where not exists (select 1 from public.groups where name = 'George Diamond');

insert into public.multiplication_candidates (
  group_id, target_year, status, shepherd_willing, needs_similar_stage,
  notes, successor_designate, meeting_time
)
select g.id, null, 'watching'::public.multiplication_candidate_status, false, false,
  'Doc: 6 members at time of plan.', null, null
from public.groups g
where g.name = 'George Diamond'
  and not exists (
    select 1 from public.multiplication_candidates c
    where c.group_id = g.id and c.archived_at is null
  );

-- Stephanie Hichox (women / young_families)
insert into public.groups (name, audience_category, life_stage)
select 'Stephanie Hichox', 'women'::public.group_audience_category, 'young_families'::public.group_life_stage
where not exists (select 1 from public.groups where name = 'Stephanie Hichox');

insert into public.multiplication_candidates (
  group_id, target_year, status, shepherd_willing, needs_similar_stage,
  notes, successor_designate, meeting_time
)
select g.id, null, 'watching'::public.multiplication_candidate_status, false, false,
  'Doc: 15 members at time of plan. Doc marked this entry `(?)` — unconfirmed; verify with Julian. Doc bracket: Women''s "30''s – 40''s". Section reconciliation: the Doc''s women''s header says "6 groups" but seven leaders are listed; the count and the listed leaders do not reconcile in the source.', null, null
from public.groups g
where g.name = 'Stephanie Hichox'
  and not exists (
    select 1 from public.multiplication_candidates c
    where c.group_id = g.id and c.archived_at is null
  );

-- Diana Johnson (women / multi_generational)
insert into public.groups (name, audience_category, life_stage)
select 'Diana Johnson', 'women'::public.group_audience_category, 'multi_generational'::public.group_life_stage
where not exists (select 1 from public.groups where name = 'Diana Johnson');

insert into public.multiplication_candidates (
  group_id, target_year, status, shepherd_willing, needs_similar_stage,
  notes, successor_designate, meeting_time
)
select g.id, null, 'watching'::public.multiplication_candidate_status, false, false,
  'Doc: 15 members at time of plan. Doc bracket: Women''s "50''s – 60''s". Section reconciliation: the Doc''s women''s header says "6 groups" but seven leaders are listed; the count and the listed leaders do not reconcile in the source.', 'Cindy Kessaris', null
from public.groups g
where g.name = 'Diana Johnson'
  and not exists (
    select 1 from public.multiplication_candidates c
    where c.group_id = g.id and c.archived_at is null
  );

-- Christine Mathias (women / multi_generational)
insert into public.groups (name, audience_category, life_stage)
select 'Christine Mathias', 'women'::public.group_audience_category, 'multi_generational'::public.group_life_stage
where not exists (select 1 from public.groups where name = 'Christine Mathias');

insert into public.multiplication_candidates (
  group_id, target_year, status, shepherd_willing, needs_similar_stage,
  notes, successor_designate, meeting_time
)
select g.id, null, 'watching'::public.multiplication_candidate_status, false, false,
  'Doc: 12 members at time of plan. Doc bracket: Women''s "50''s – 60''s". Section reconciliation: the Doc''s women''s header says "6 groups" but seven leaders are listed; the count and the listed leaders do not reconcile in the source.', null, null
from public.groups g
where g.name = 'Christine Mathias'
  and not exists (
    select 1 from public.multiplication_candidates c
    where c.group_id = g.id and c.archived_at is null
  );

-- Gail Blair (women / multi_generational)
insert into public.groups (name, audience_category, life_stage)
select 'Gail Blair', 'women'::public.group_audience_category, 'multi_generational'::public.group_life_stage
where not exists (select 1 from public.groups where name = 'Gail Blair');

insert into public.multiplication_candidates (
  group_id, target_year, status, shepherd_willing, needs_similar_stage,
  notes, successor_designate, meeting_time
)
select g.id, null, 'watching'::public.multiplication_candidate_status, false, false,
  'Doc: 4 members at time of plan. Doc bracket: Women''s "60''s – 70''s". Section reconciliation: the Doc''s women''s header says "6 groups" but seven leaders are listed; the count and the listed leaders do not reconcile in the source.', null, null
from public.groups g
where g.name = 'Gail Blair'
  and not exists (
    select 1 from public.multiplication_candidates c
    where c.group_id = g.id and c.archived_at is null
  );

-- Donna Lawrence (women / multi_generational)
insert into public.groups (name, audience_category, life_stage)
select 'Donna Lawrence', 'women'::public.group_audience_category, 'multi_generational'::public.group_life_stage
where not exists (select 1 from public.groups where name = 'Donna Lawrence');

insert into public.multiplication_candidates (
  group_id, target_year, status, shepherd_willing, needs_similar_stage,
  notes, successor_designate, meeting_time
)
select g.id, null, 'watching'::public.multiplication_candidate_status, false, false,
  'Doc: 13 members at time of plan. Doc bracket: Women''s "60''s – 70''s". Section reconciliation: the Doc''s women''s header says "6 groups" but seven leaders are listed; the count and the listed leaders do not reconcile in the source.', null, null
from public.groups g
where g.name = 'Donna Lawrence'
  and not exists (
    select 1 from public.multiplication_candidates c
    where c.group_id = g.id and c.archived_at is null
  );

-- Judi Tripp (women / multi_generational)
insert into public.groups (name, audience_category, life_stage)
select 'Judi Tripp', 'women'::public.group_audience_category, 'multi_generational'::public.group_life_stage
where not exists (select 1 from public.groups where name = 'Judi Tripp');

insert into public.multiplication_candidates (
  group_id, target_year, status, shepherd_willing, needs_similar_stage,
  notes, successor_designate, meeting_time
)
select g.id, null, 'watching'::public.multiplication_candidate_status, false, false,
  'Doc: 9 members at time of plan. Doc bracket: Women''s "60''s – 70''s". Section reconciliation: the Doc''s women''s header says "6 groups" but seven leaders are listed; the count and the listed leaders do not reconcile in the source.', null, null
from public.groups g
where g.name = 'Judi Tripp'
  and not exists (
    select 1 from public.multiplication_candidates c
    where c.group_id = g.id and c.archived_at is null
  );

-- Sandra Lea (women / spanish_speaking)
insert into public.groups (name, audience_category, life_stage)
select 'Sandra Lea', 'women'::public.group_audience_category, 'spanish_speaking'::public.group_life_stage
where not exists (select 1 from public.groups where name = 'Sandra Lea');

insert into public.multiplication_candidates (
  group_id, target_year, status, shepherd_willing, needs_similar_stage,
  notes, successor_designate, meeting_time
)
select g.id, null, 'watching'::public.multiplication_candidate_status, false, false,
  'Doc marked this entry `(?)` — unconfirmed; verify with Julian. Section reconciliation: the Doc''s women''s header says "6 groups" but seven leaders are listed; the count and the listed leaders do not reconcile in the source.', null, null
from public.groups g
where g.name = 'Sandra Lea'
  and not exists (
    select 1 from public.multiplication_candidates c
    where c.group_id = g.id and c.archived_at is null
  );

-- Keith and Joy Krispin (mixed / young_professionals)
insert into public.groups (name, audience_category, life_stage)
select 'Keith and Joy Krispin', 'mixed'::public.group_audience_category, 'young_professionals'::public.group_life_stage
where not exists (select 1 from public.groups where name = 'Keith and Joy Krispin');

insert into public.multiplication_candidates (
  group_id, target_year, status, shepherd_willing, needs_similar_stage,
  notes, successor_designate, meeting_time
)
select g.id, null, 'watching'::public.multiplication_candidate_status, false, false,
  'Doc: 17 members at time of plan.', null, null
from public.groups g
where g.name = 'Keith and Joy Krispin'
  and not exists (
    select 1 from public.multiplication_candidates c
    where c.group_id = g.id and c.archived_at is null
  );

-- Mike and Mary Jo Beasley (mixed / young_professionals)
insert into public.groups (name, audience_category, life_stage)
select 'Mike and Mary Jo Beasley', 'mixed'::public.group_audience_category, 'young_professionals'::public.group_life_stage
where not exists (select 1 from public.groups where name = 'Mike and Mary Jo Beasley');

insert into public.multiplication_candidates (
  group_id, target_year, status, shepherd_willing, needs_similar_stage,
  notes, successor_designate, meeting_time
)
select g.id, null, 'watching'::public.multiplication_candidate_status, false, false,
  'Doc marked this entry `(?)` — unconfirmed; verify with Julian. Doc note: on the same source line as the Krispins. Section reconciliation: the Doc''s mixed header says "18 groups"; the listed leaders do not cleanly reconcile to that count (e.g. the Beasley line shares a source line with the Krispins).', null, null
from public.groups g
where g.name = 'Mike and Mary Jo Beasley'
  and not exists (
    select 1 from public.multiplication_candidates c
    where c.group_id = g.id and c.archived_at is null
  );

-- Caleb and Kate Senyshyn (mixed / young_professionals)
insert into public.groups (name, audience_category, life_stage)
select 'Caleb and Kate Senyshyn', 'mixed'::public.group_audience_category, 'young_professionals'::public.group_life_stage
where not exists (select 1 from public.groups where name = 'Caleb and Kate Senyshyn');

insert into public.multiplication_candidates (
  group_id, target_year, status, shepherd_willing, needs_similar_stage,
  notes, successor_designate, meeting_time
)
select g.id, null, 'watching'::public.multiplication_candidate_status, false, false,
  'Doc: 8 members at time of plan.', null, null
from public.groups g
where g.name = 'Caleb and Kate Senyshyn'
  and not exists (
    select 1 from public.multiplication_candidates c
    where c.group_id = g.id and c.archived_at is null
  );

-- Ben and Gracie Bertsche (mixed / young_families)
insert into public.groups (name, audience_category, life_stage)
select 'Ben and Gracie Bertsche', 'mixed'::public.group_audience_category, 'young_families'::public.group_life_stage
where not exists (select 1 from public.groups where name = 'Ben and Gracie Bertsche');

insert into public.multiplication_candidates (
  group_id, target_year, status, shepherd_willing, needs_similar_stage,
  notes, successor_designate, meeting_time
)
select g.id, null, 'watching'::public.multiplication_candidate_status, false, false,
  'Doc: 12 members at time of plan.', null, null
from public.groups g
where g.name = 'Ben and Gracie Bertsche'
  and not exists (
    select 1 from public.multiplication_candidates c
    where c.group_id = g.id and c.archived_at is null
  );

-- Julian and Paula Guevara (mixed / young_families)
insert into public.groups (name, audience_category, life_stage)
select 'Julian and Paula Guevara', 'mixed'::public.group_audience_category, 'young_families'::public.group_life_stage
where not exists (select 1 from public.groups where name = 'Julian and Paula Guevara');

insert into public.multiplication_candidates (
  group_id, target_year, status, shepherd_willing, needs_similar_stage,
  notes, successor_designate, meeting_time
)
select g.id, null, 'watching'::public.multiplication_candidate_status, false, false,
  'Doc: 8 members at time of plan. Doc note: (closing in August).', null, null
from public.groups g
where g.name = 'Julian and Paula Guevara'
  and not exists (
    select 1 from public.multiplication_candidates c
    where c.group_id = g.id and c.archived_at is null
  );

-- Calvin and Julianne Braker (mixed / families_with_kids)
insert into public.groups (name, audience_category, life_stage)
select 'Calvin and Julianne Braker', 'mixed'::public.group_audience_category, 'families_with_kids'::public.group_life_stage
where not exists (select 1 from public.groups where name = 'Calvin and Julianne Braker');

insert into public.multiplication_candidates (
  group_id, target_year, status, shepherd_willing, needs_similar_stage,
  notes, successor_designate, meeting_time
)
select g.id, null, 'watching'::public.multiplication_candidate_status, false, false,
  'Doc: 14 members at time of plan.', null, null
from public.groups g
where g.name = 'Calvin and Julianne Braker'
  and not exists (
    select 1 from public.multiplication_candidates c
    where c.group_id = g.id and c.archived_at is null
  );

-- David and Megan Cahill (mixed / families_with_kids)
insert into public.groups (name, audience_category, life_stage)
select 'David and Megan Cahill', 'mixed'::public.group_audience_category, 'families_with_kids'::public.group_life_stage
where not exists (select 1 from public.groups where name = 'David and Megan Cahill');

insert into public.multiplication_candidates (
  group_id, target_year, status, shepherd_willing, needs_similar_stage,
  notes, successor_designate, meeting_time
)
select g.id, null, 'watching'::public.multiplication_candidate_status, false, false,
  'Doc: 12 members at time of plan.', 'Gonzalez', null
from public.groups g
where g.name = 'David and Megan Cahill'
  and not exists (
    select 1 from public.multiplication_candidates c
    where c.group_id = g.id and c.archived_at is null
  );

-- Andre and Lindsey Patrick (mixed / families_with_kids)
insert into public.groups (name, audience_category, life_stage)
select 'Andre and Lindsey Patrick', 'mixed'::public.group_audience_category, 'families_with_kids'::public.group_life_stage
where not exists (select 1 from public.groups where name = 'Andre and Lindsey Patrick');

insert into public.multiplication_candidates (
  group_id, target_year, status, shepherd_willing, needs_similar_stage,
  notes, successor_designate, meeting_time
)
select g.id, null, 'watching'::public.multiplication_candidate_status, false, false,
  'Doc: 12 members at time of plan.', 'Marshalls', null
from public.groups g
where g.name = 'Andre and Lindsey Patrick'
  and not exists (
    select 1 from public.multiplication_candidates c
    where c.group_id = g.id and c.archived_at is null
  );

-- Dennis Rens (mixed / families_with_adult_kids)
insert into public.groups (name, audience_category, life_stage)
select 'Dennis Rens', 'mixed'::public.group_audience_category, 'families_with_adult_kids'::public.group_life_stage
where not exists (select 1 from public.groups where name = 'Dennis Rens');

insert into public.multiplication_candidates (
  group_id, target_year, status, shepherd_willing, needs_similar_stage,
  notes, successor_designate, meeting_time
)
select g.id, null, 'watching'::public.multiplication_candidate_status, false, false,
  'Doc: 15 members at time of plan. Doc marked this entry `(?)` — unconfirmed; verify with Julian. Doc bracket: "Families with young professional kids" (no exact life-stage value; mapped to families_with_adult_kids).', null, null
from public.groups g
where g.name = 'Dennis Rens'
  and not exists (
    select 1 from public.multiplication_candidates c
    where c.group_id = g.id and c.archived_at is null
  );

-- Ron and Carole Lanier (mixed / families_with_adult_kids)
insert into public.groups (name, audience_category, life_stage)
select 'Ron and Carole Lanier', 'mixed'::public.group_audience_category, 'families_with_adult_kids'::public.group_life_stage
where not exists (select 1 from public.groups where name = 'Ron and Carole Lanier');

insert into public.multiplication_candidates (
  group_id, target_year, status, shepherd_willing, needs_similar_stage,
  notes, successor_designate, meeting_time
)
select g.id, null, 'watching'::public.multiplication_candidate_status, false, false,
  'Doc: 10 members at time of plan.', null, null
from public.groups g
where g.name = 'Ron and Carole Lanier'
  and not exists (
    select 1 from public.multiplication_candidates c
    where c.group_id = g.id and c.archived_at is null
  );

-- Keith and Mary Lee (mixed / families_with_adult_kids)
insert into public.groups (name, audience_category, life_stage)
select 'Keith and Mary Lee', 'mixed'::public.group_audience_category, 'families_with_adult_kids'::public.group_life_stage
where not exists (select 1 from public.groups where name = 'Keith and Mary Lee');

insert into public.multiplication_candidates (
  group_id, target_year, status, shepherd_willing, needs_similar_stage,
  notes, successor_designate, meeting_time
)
select g.id, null, 'watching'::public.multiplication_candidate_status, false, false,
  'Doc: 10 members at time of plan.', null, null
from public.groups g
where g.name = 'Keith and Mary Lee'
  and not exists (
    select 1 from public.multiplication_candidates c
    where c.group_id = g.id and c.archived_at is null
  );

-- Tim and Sou Boberg (mixed / retirement)
insert into public.groups (name, audience_category, life_stage)
select 'Tim and Sou Boberg', 'mixed'::public.group_audience_category, 'retirement'::public.group_life_stage
where not exists (select 1 from public.groups where name = 'Tim and Sou Boberg');

insert into public.multiplication_candidates (
  group_id, target_year, status, shepherd_willing, needs_similar_stage,
  notes, successor_designate, meeting_time
)
select g.id, null, 'watching'::public.multiplication_candidate_status, false, false,
  'Doc: 12 members at time of plan. Doc bracket header hedge: "Retirement (some or most of them)".', null, 'during_the_day'::public.multiplication_meeting_time
from public.groups g
where g.name = 'Tim and Sou Boberg'
  and not exists (
    select 1 from public.multiplication_candidates c
    where c.group_id = g.id and c.archived_at is null
  );

-- Carol Dembkowski (mixed / retirement)
insert into public.groups (name, audience_category, life_stage)
select 'Carol Dembkowski', 'mixed'::public.group_audience_category, 'retirement'::public.group_life_stage
where not exists (select 1 from public.groups where name = 'Carol Dembkowski');

insert into public.multiplication_candidates (
  group_id, target_year, status, shepherd_willing, needs_similar_stage,
  notes, successor_designate, meeting_time
)
select g.id, null, 'watching'::public.multiplication_candidate_status, false, false,
  'Doc: 8 members at time of plan. Doc bracket header hedge: "Retirement (some or most of them)".', null, 'evening'::public.multiplication_meeting_time
from public.groups g
where g.name = 'Carol Dembkowski'
  and not exists (
    select 1 from public.multiplication_candidates c
    where c.group_id = g.id and c.archived_at is null
  );

-- Phil and Karen Dickert (mixed / retirement)
insert into public.groups (name, audience_category, life_stage)
select 'Phil and Karen Dickert', 'mixed'::public.group_audience_category, 'retirement'::public.group_life_stage
where not exists (select 1 from public.groups where name = 'Phil and Karen Dickert');

insert into public.multiplication_candidates (
  group_id, target_year, status, shepherd_willing, needs_similar_stage,
  notes, successor_designate, meeting_time
)
select g.id, null, 'watching'::public.multiplication_candidate_status, false, false,
  'Doc: 12 members at time of plan. Doc bracket header hedge: "Retirement (some or most of them)".', null, 'during_the_day'::public.multiplication_meeting_time
from public.groups g
where g.name = 'Phil and Karen Dickert'
  and not exists (
    select 1 from public.multiplication_candidates c
    where c.group_id = g.id and c.archived_at is null
  );

-- Jere and Jana Miller (mixed / retirement)
insert into public.groups (name, audience_category, life_stage)
select 'Jere and Jana Miller', 'mixed'::public.group_audience_category, 'retirement'::public.group_life_stage
where not exists (select 1 from public.groups where name = 'Jere and Jana Miller');

insert into public.multiplication_candidates (
  group_id, target_year, status, shepherd_willing, needs_similar_stage,
  notes, successor_designate, meeting_time
)
select g.id, null, 'watching'::public.multiplication_candidate_status, false, false,
  'Doc: 12 members at time of plan. Doc note: (Vietmeier''s?) — ambiguous successor/over-shepherd, unconfirmed. Doc bracket header hedge: "Retirement (some or most of them)".', null, 'during_the_day'::public.multiplication_meeting_time
from public.groups g
where g.name = 'Jere and Jana Miller'
  and not exists (
    select 1 from public.multiplication_candidates c
    where c.group_id = g.id and c.archived_at is null
  );

-- Phil and Karen Thatcher (mixed / retirement)
insert into public.groups (name, audience_category, life_stage)
select 'Phil and Karen Thatcher', 'mixed'::public.group_audience_category, 'retirement'::public.group_life_stage
where not exists (select 1 from public.groups where name = 'Phil and Karen Thatcher');

insert into public.multiplication_candidates (
  group_id, target_year, status, shepherd_willing, needs_similar_stage,
  notes, successor_designate, meeting_time
)
select g.id, null, 'watching'::public.multiplication_candidate_status, false, false,
  'Doc: 13 members at time of plan. Doc bracket header hedge: "Retirement (some or most of them)".', null, 'evening'::public.multiplication_meeting_time
from public.groups g
where g.name = 'Phil and Karen Thatcher'
  and not exists (
    select 1 from public.multiplication_candidates c
    where c.group_id = g.id and c.archived_at is null
  );

-- Ray and Julie Herrick (mixed / retirement)
insert into public.groups (name, audience_category, life_stage)
select 'Ray and Julie Herrick', 'mixed'::public.group_audience_category, 'retirement'::public.group_life_stage
where not exists (select 1 from public.groups where name = 'Ray and Julie Herrick');

insert into public.multiplication_candidates (
  group_id, target_year, status, shepherd_willing, needs_similar_stage,
  notes, successor_designate, meeting_time
)
select g.id, null, 'watching'::public.multiplication_candidate_status, false, false,
  'Doc: 12 members at time of plan. Doc bracket header hedge: "Retirement (some or most of them)".', null, 'during_the_day'::public.multiplication_meeting_time
from public.groups g
where g.name = 'Ray and Julie Herrick'
  and not exists (
    select 1 from public.multiplication_candidates c
    where c.group_id = g.id and c.archived_at is null
  );

-- Chris/Sydney Anderson (mixed / multi_generational)
insert into public.groups (name, audience_category, life_stage)
select 'Chris/Sydney Anderson', 'mixed'::public.group_audience_category, 'multi_generational'::public.group_life_stage
where not exists (select 1 from public.groups where name = 'Chris/Sydney Anderson');

insert into public.multiplication_candidates (
  group_id, target_year, status, shepherd_willing, needs_similar_stage,
  notes, successor_designate, meeting_time
)
select g.id, null, 'watching'::public.multiplication_candidate_status, false, false,
  'Doc: 6 members at time of plan.', null, null
from public.groups g
where g.name = 'Chris/Sydney Anderson'
  and not exists (
    select 1 from public.multiplication_candidates c
    where c.group_id = g.id and c.archived_at is null
  );

-- Phil and Sandy Leman (mixed / multi_generational)
insert into public.groups (name, audience_category, life_stage)
select 'Phil and Sandy Leman', 'mixed'::public.group_audience_category, 'multi_generational'::public.group_life_stage
where not exists (select 1 from public.groups where name = 'Phil and Sandy Leman');

insert into public.multiplication_candidates (
  group_id, target_year, status, shepherd_willing, needs_similar_stage,
  notes, successor_designate, meeting_time
)
select g.id, null, 'watching'::public.multiplication_candidate_status, false, false,
  'Doc: 12 members at time of plan.', null, null
from public.groups g
where g.name = 'Phil and Sandy Leman'
  and not exists (
    select 1 from public.multiplication_candidates c
    where c.group_id = g.id and c.archived_at is null
  );
