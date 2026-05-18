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
- **Phase 5A.1 (current)**: people foundation writes. Admins can:
  add leader profiles, add member records, assign leaders/co-leaders
  to groups, place members into groups, deactivate either, and review
  a recent admin audit trail. Writes flow through six narrow
  `public.admin_*` SECURITY DEFINER Postgres RPCs so each data
  change and its `audit_events` row commit in a single transaction.
  RLS stays SELECT-only — no broad write policies. No deletes
  anywhere. No service role. No app-based creation of another
  ministry admin and no role-change workflow in this phase. ✅
- **Phase 5B (after 5A.1)**: operational write workflows —
  attendance submission, guest capture, follow-up updates, and admin
  review queues. This is where the broader operational INSERT /
  UPDATE / DELETE RLS policies arrive.
- **Later phases (not in 5A.1)**: calendar, SMS messaging / consent /
  phone login, prayer requests, attendance analytics, follow-up
  editing, multi-admin management, role change workflows,
  self-service member login, staff viewer management.
