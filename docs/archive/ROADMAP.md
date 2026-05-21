# Roadmap

- **Phase 0**: bootstrap, docs, and UI foundation. ✅
- **Phase 1**: visual design system + reusable preview pages for admin and leader flows. ✅
- **Phase 2**: database schema + enums + seed data + docs. ✅
- **Phase 3**: safe Supabase read integration, fallback-aware dashboard data flow, real
  capacity and pipeline visualizations. ✅
- **Phase 4**: security foundation — Supabase Auth, protected routes,
  role-aware access, assigned leader scoping, and Row Level Security policy
  enforcement. ✅
- **Phase 4.1**: docs + dev-helper patch — super admin bootstrap, role
  model clarification, Phase 5A scope outline. No app write code, no new
  RLS policies. ✅
- **Phase 5A.0**: admin people & role management UI/UX scaffold —
  protected `/admin/people` route, disabled action cards, polished
  empty states, pure-TypeScript validation helpers, throwing
  server-action stubs documenting the Phase 5A.1 contract. ✅
- **Phase 5A.1**: people foundation writes — leader / member create,
  group assignments, deactivation, audit trail via six
  `public.admin_*` SECURITY DEFINER RPCs. ✅
- **Phase 5A.2**: admin group management (create, edit, soft close,
  reopen) plus tightening of `audit_events` reads to super_admin. ✅
- **Phase 5A.3**: super admin console at `/admin/super-admin` plus
  one `super_admin_update_profile_role` RPC. ✅
- **Phase 5B.0**: leader weekly check-ins + attendance submission. ✅
- **Phase 5B.1**: read-only admin weekly check-in review at
  `/admin/check-ins`. ✅
- **Phase 5A.4**: admin operations UX + metric settings
  foundation. Filterable people / groups directories, a new
  `/admin/settings` page with global metric defaults and per-group
  overrides, and a ministry-admin-safe `leader` ⇄ `co_leader` role
  swap. Three new SECURITY DEFINER RPCs; one new admin-only
  `group_metric_settings` table; typed `lib/admin/metrics.ts`
  helpers prepare the dashboard for later rebuild. No service role,
  no broad write RLS, no hard deletes. ✅
- **Phase 6.0**: admin dashboard metrics integration. `/admin` is
  rebuilt as Julian's command center — six summary cards, a
  prioritized attention queue, five capacity buckets, seven health
  buckets, a setup-gaps panel, and read-only consumption of the
  Phase 5A.4 metric helpers. ✅
- **Phase 5C.0**: guest pipeline + follow-up foundation.
  Two new admin routes (`/admin/guests`, `/admin/follow-ups`), a
  leader follow-ups section on `/leader`, and five new SECURITY
  DEFINER RPCs (`admin_create_guest`, `admin_update_guest_pipeline`,
  `admin_create_follow_up`, `admin_update_follow_up_status`,
  `leader_update_follow_up_status`). Manual workflow only — no SMS,
  no public guest signup, no automation, no exports. ✅
- **Phase 5C.1 (current)**: guest + follow-up privacy hardening and
  post-merge verification pass. No new features, no new RPCs, no
  new migrations. Reinforces the leader-side redaction boundary
  that keeps `follow_ups.admin_private_note` out of `/leader` reads:
  explicit JSDoc privacy contracts on `LEADER_FOLLOW_UP_COLUMNS`,
  `LeaderFollowUpRow`, `fetchFollowUpsForLeader`, and the admin-only
  `fetchFollowUpsForAdmin`; a narrowed `LeaderFollowUpItem`
  view-model with a matching privacy note; documented grep regression
  check. Verifies leader visibility, status-transition guards, and
  the six new Super Admin audit summaries. Light UI polish:
  separate "nothing yet" vs "filter mismatch" empty states on
  `/admin/guests` and `/admin/follow-ups`. Column-level RLS / a
  leader-safe Postgres view documented as future hardening.
- **Later phases**: SMS / consent / phone login, calendar, prayer
  requests, attendance analytics, follow-up editing surface for
  leaders beyond status updates, advanced dashboard builder, custom
  formulas, self-service member login.
