-- Performance hardening surfaced by the Supabase performance advisor.
-- Two independent, behavior-preserving changes:
--
--   1. auth_rls_initplan: two RLS policies call auth.uid() bare, so Postgres
--      re-evaluates the function once PER ROW during a scan. Wrapping the call
--      as (select auth.uid()) lets the planner treat it as a one-time
--      InitPlan, evaluated once per query. The policies' logic is unchanged.
--      profiles is read on every authenticated request (session lookup +
--      directory), so this is the most worthwhile of the lints.
--
--   2. unindexed_foreign_keys: add covering indexes for the foreign keys that
--      the app actually filters, joins, or evaluates inside RLS. Pure
--      write-only audit FKs (e.g. *_submitted_by, *_created_by, *_updated_by)
--      are intentionally left unindexed: they are never used as lookup keys,
--      so an index there would only add write overhead (and would itself be
--      flagged as an unused index).
--
-- Data volumes are currently small, so these are cheap to apply and primarily
-- prevent a performance cliff as the tables grow. Indexes use IF NOT EXISTS so
-- the migration is idempotent.

-- ---------------------------------------------------------------------------
-- 1. RLS InitPlan fixes (wrap auth.uid() in a scalar subselect)
-- ---------------------------------------------------------------------------

-- profiles: a user may always read their own profile row.
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
  for select to authenticated using (auth_user_id = (select auth.uid()));

-- app_settings: any authenticated user may read.
drop policy if exists app_settings_auth_read on public.app_settings;
create policy app_settings_auth_read on public.app_settings
  for select to authenticated using ((select auth.uid()) is not null);

-- ---------------------------------------------------------------------------
-- 2. Covering indexes for foreign keys on real lookup / join / RLS paths
-- ---------------------------------------------------------------------------

-- group_leaders.profile_id: evaluated inside auth_is_leader_of() (RLS) for
-- member/attendance/guest reads, and for "which groups does this leader lead?".
-- Composite with (active, group_id) so the common active-leadership check is an
-- index-only path.
create index if not exists idx_group_leaders_profile_active
  on public.group_leaders (profile_id, active, group_id);

-- follow_ups: leader-scoped "assigned to me" filtering and the reverse lookups
-- that count follow-ups related to a given member / guest / group.
create index if not exists idx_follow_ups_assigned_to
  on public.follow_ups (assigned_to, status);
create index if not exists idx_follow_ups_related_member
  on public.follow_ups (related_member_id);
create index if not exists idx_follow_ups_related_guest
  on public.follow_ups (related_guest_id);
create index if not exists idx_follow_ups_related_group
  on public.follow_ups (related_group_id);

-- guests: both group FKs are evaluated in guests_leader_read (RLS); the owner
-- FK supports "guests I'm following up".
create index if not exists idx_guests_first_attended_group
  on public.guests (first_attended_group_id);
create index if not exists idx_guests_assigned_group
  on public.guests (assigned_group_id);
create index if not exists idx_guests_follow_up_owner
  on public.guests (follow_up_owner_id);
