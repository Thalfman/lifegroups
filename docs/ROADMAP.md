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
- **Phase 5A.4 (current)**: admin operations UX + metric settings
  foundation. Filterable people / groups directories, a new
  `/admin/settings` page with global metric defaults and per-group
  overrides, and a ministry-admin-safe `leader` ⇄ `co_leader` role
  swap. Three new SECURITY DEFINER RPCs; one new admin-only
  `group_metric_settings` table; typed `lib/admin/metrics.ts`
  helpers prepare the dashboard for later rebuild. No service role,
  no broad write RLS, no hard deletes.
- **Later phases**: guest pipeline, SMS / consent / phone login,
  calendar, prayer requests, attendance analytics, follow-up
  editing, advanced dashboard builder, custom formulas,
  self-service member login.
