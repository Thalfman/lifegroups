-- Phase OS.3: Over-Shepherd coverage-scoped read RLS.
--
-- Adds coverage-scoped SELECT policies for the over_shepherd role so an
-- Over-Shepherd can read ONLY the Shepherds they actively cover — their care
-- profile, their care-interaction history, their coverage assignment, and the
-- covered Shepherd's profile row (for names). Per
-- docs/adr/0002-oversight-ladder-and-leader-gating.md the ladder reads
-- downward: these policies are ADDED ALONGSIDE the existing admin policies
-- (admin keeps full read; nothing is broadened or replaced).
--
-- Every predicate routes through the Phase OS.2 helpers
-- (auth_over_shepherd_covers / auth_over_shepherd_id), both SECURITY DEFINER.
-- For any caller that is not a single-active-match over_shepherd, those
-- helpers return null/false, so these policies grant nothing to admin,
-- staff_viewer, leader, or anon — admin reads are unchanged and staff_viewer
-- gains nothing.
--
-- SC.4 design-around (decided): no private-note tier is built. The
-- creator-only guarantee is met by (a) not building private notes and (b)
-- keeping the admin-only summary off this surface. The row policy below grants
-- the whole shepherd_care_profiles row — RLS is row-level only and cannot
-- withhold a single column — so the admin-only summary is NOT fenced here.
-- phase_os5 (20260529004000) moves admin_summary into its own admin-only table
-- (shepherd_care_admin_notes) so this coverage policy never reaches it; the app
-- column allowlist + typed Omit<> remain as a defense-in-depth belt.

-- profiles: an Over-Shepherd may read the profile rows of the Shepherds they
-- actively cover (names/emails for the directory). Self-read + admin/staff
-- read policies are untouched and continue to apply.
create policy profiles_over_shepherd_read on public.profiles
  for select to authenticated
  using (public.auth_over_shepherd_covers(id));

-- shepherd_care_profiles: scoped to actively-covered Shepherds.
create policy shepherd_care_profiles_over_shepherd_select
  on public.shepherd_care_profiles
  for select to authenticated
  using (public.auth_over_shepherd_covers(shepherd_profile_id));

-- shepherd_care_interactions: scoped via the parent care profile's Shepherd.
create policy shepherd_care_interactions_over_shepherd_select
  on public.shepherd_care_interactions
  for select to authenticated
  using (
    exists (
      select 1
        from public.shepherd_care_profiles scp
       where scp.id = shepherd_care_interactions.care_profile_id
         and public.auth_over_shepherd_covers(scp.shepherd_profile_id)
    )
  );

-- shepherd_coverage_assignments: an Over-Shepherd may read only their OWN
-- active coverage assignments. Assignments belonging to a different
-- Over-Shepherd stay invisible.
create policy shepherd_coverage_assignments_over_shepherd_select
  on public.shepherd_coverage_assignments
  for select to authenticated
  using (
    over_shepherd_id = public.auth_over_shepherd_id()
    and active
  );
