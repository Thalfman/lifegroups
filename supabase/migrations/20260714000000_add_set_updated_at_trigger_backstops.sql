-- #865: set_updated_at trigger backstops.
--
-- About 20 tables install the standard `before update … set_updated_at()`
-- trigger, but a later-added cluster relied purely on each RPC remembering to
-- write `updated_at = now()`. That is currently correct everywhere — this is
-- prevention, not a live-bug fix: with the trigger in place the column can
-- never go stale regardless of what a future UPDATE path forgets. The manual
-- `updated_at = now()` assignments in existing RPCs stay (the trigger
-- overwrites with the same value; writes are RPC-only, so the redundant
-- firing is cheap).
--
-- Companion fitness scan: tests/fitness/updated-at-trigger-coverage.test.ts
-- asserts every table that declares an `updated_at` column has a
-- `set_updated_at` trigger in force, so future tables can't regress.

drop trigger if exists account_deletion_requests_set_updated_at on public.account_deletion_requests;
create trigger account_deletion_requests_set_updated_at
  before update on public.account_deletion_requests
  for each row execute function public.set_updated_at();

drop trigger if exists shepherd_care_profiles_set_updated_at on public.shepherd_care_profiles;
create trigger shepherd_care_profiles_set_updated_at
  before update on public.shepherd_care_profiles
  for each row execute function public.set_updated_at();

drop trigger if exists shepherd_care_follow_ups_set_updated_at on public.shepherd_care_follow_ups;
create trigger shepherd_care_follow_ups_set_updated_at
  before update on public.shepherd_care_follow_ups
  for each row execute function public.set_updated_at();

drop trigger if exists shepherd_care_private_notes_set_updated_at on public.shepherd_care_private_notes;
create trigger shepherd_care_private_notes_set_updated_at
  before update on public.shepherd_care_private_notes
  for each row execute function public.set_updated_at();

drop trigger if exists member_care_profiles_set_updated_at on public.member_care_profiles;
create trigger member_care_profiles_set_updated_at
  before update on public.member_care_profiles
  for each row execute function public.set_updated_at();

drop trigger if exists over_shepherds_set_updated_at on public.over_shepherds;
create trigger over_shepherds_set_updated_at
  before update on public.over_shepherds
  for each row execute function public.set_updated_at();

drop trigger if exists shepherd_coverage_assignments_set_updated_at on public.shepherd_coverage_assignments;
create trigger shepherd_coverage_assignments_set_updated_at
  before update on public.shepherd_coverage_assignments
  for each row execute function public.set_updated_at();

drop trigger if exists launch_planning_scenarios_set_updated_at on public.launch_planning_scenarios;
create trigger launch_planning_scenarios_set_updated_at
  before update on public.launch_planning_scenarios
  for each row execute function public.set_updated_at();

drop trigger if exists shepherd_care_admin_notes_set_updated_at on public.shepherd_care_admin_notes;
create trigger shepherd_care_admin_notes_set_updated_at
  before update on public.shepherd_care_admin_notes
  for each row execute function public.set_updated_at();
