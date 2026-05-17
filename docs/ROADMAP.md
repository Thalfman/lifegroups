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
- **Phase 5A.0 (current)**: admin people & role management UI/UX
  scaffold. Adds the protected `/admin/people` route, the disabled
  action cards, polished empty states, pure-TypeScript validation
  helpers, and the throwing server-action stubs that document the
  Phase 5A.1 contract. No mock data, no real writes, no new RLS
  policies. See `docs/PHASE_5A_ADMIN_MANAGEMENT.md` and
  `docs/PHASE_5A_ACTION_CONTRACTS.md`. ✅
- **Phase 5A.1 (pending)**: write policies + real admin actions —
  super_admin and ministry_admin create/update admin, leader, and
  member records through narrow, allowlisted server actions matched
  by narrow INSERT/UPDATE RLS policies, with audit_events recorded
  per write. Blocked on live Supabase verification of Phase 4 RLS.
- **Phase 5B (after 5A.1)**: operational write workflows —
  attendance submission, guest capture, follow-up updates, and admin
  review queues. This is where the broader operational INSERT /
  UPDATE / DELETE RLS policies arrive.
