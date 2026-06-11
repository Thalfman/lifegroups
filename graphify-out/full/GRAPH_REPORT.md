# Architecture Graph Report - full

Generated: 2026-06-11T15:08:15.461Z

## Summary
- Nodes: 3581
- Edges: 8378
- Communities: 160
- Staged files: 504

## Exclusion Audit
- OK: node_modules: 0
- OK: .next: 0
- OK: dist/build/out: 0
- OK: coverage: 0
- OK: graphify-out: 0
- OK: .graphify: 0
- OK: Graphify tooling: 0
- OK: tests: 0
- OK: generated DB/types: 0
- OK: lock files: 0
- OK: temp folders: 0

## Top Hubs
- rpc.ts (149) - lib/admin/rpc.ts
- createSupabaseServerClient() (132) - lib/supabase/server.ts
- cn() (115) - lib/utils.ts
- callUuidRpc() (108) - lib/shared/rpc.ts
- runAdminWriteAction() (108) - lib/admin/run-action.ts
- groups-directory.tsx (96) - components/admin/groups-directory.tsx
- useActionForm() (96) - components/admin/forms/action-form.tsx
- harness-client.tsx (93) - app/a11y-harness/harness-client.tsx
- super-admin-console.tsx (84) - components/admin/super-admin-console.tsx
- read-models.ts (81) - lib/supabase/read-models.ts
- queries.ts (75) - lib/dashboard/queries.ts
- actions.ts (70) - app/(protected)/admin/shepherd-care/actions.ts

## Largest Communities
- Admin RPC Layer (88 nodes, inferred)
- Group Management UI (68 nodes, inferred)
- Group Management UI (62 nodes, inferred)
- Admin Form Components (60 nodes, inferred)
- Admin RPC Layer (54 nodes, inferred)
- Admin RPC Layer (52 nodes, inferred)
- Admin Validation (50 nodes, inferred)
- Plan Pipeline (49 nodes, inferred)
- Admin People Actions (45 nodes, inferred)
- Plan Pipeline (45 nodes, inferred)
- Plan Pipeline (45 nodes, inferred)
- Admin RPC Layer (45 nodes, inferred)

## Inferred Community Labels
| ID | Label | Source | Basis |
| --- | --- | --- | --- |
| 0 | Admin RPC Layer | inferred | top files matched /lib\/admin\/rpc\.ts\|lib\/shared\/rpc\.ts\|rpc\(\)\|safeRpc/i |
| 1 | Group Management UI | inferred | top files matched /admin\/groups\|groups-directory\|group-detail\|group-roster\|group-health/i |
| 2 | Group Management UI | inferred | top files matched /admin\/groups\|groups-directory\|group-detail\|group-roster\|group-health/i |
| 3 | Admin Form Components | inferred | top files matched /components\/admin\/forms\|lib\/forms\|action-form\|confirm-action/i |
| 4 | Admin RPC Layer | inferred | top files matched /lib\/admin\/rpc\.ts\|lib\/shared\/rpc\.ts\|rpc\(\)\|safeRpc/i |
| 5 | Admin RPC Layer | inferred | top files matched /lib\/admin\/rpc\.ts\|lib\/shared\/rpc\.ts\|rpc\(\)\|safeRpc/i |
| 6 | Admin Validation | inferred | top files matched /lib\/admin\/validation\//i |
| 7 | Plan Pipeline | inferred | top files matched /admin\/plan\|prospect\|planning\|launch-planning\|scenario/i |
| 8 | Admin People Actions | inferred | top files matched /admin\/people\/actions\|components\/admin\/people\|person-detail\|people-management\|adminassign\|admincreate(member\|leader\|ministry)\|deactivate(member\|profile)\|membership/i |
| 9 | Plan Pipeline | inferred | top files matched /admin\/plan\|prospect\|planning\|launch-planning\|scenario/i |
| 10 | Plan Pipeline | inferred | top files matched /admin\/plan\|prospect\|planning\|launch-planning\|scenario/i |
| 11 | Admin RPC Layer | inferred | top files matched /lib\/admin\/rpc\.ts\|lib\/shared\/rpc\.ts\|rpc\(\)\|safeRpc/i |
| 12 | Group Management UI | inferred | top files matched /admin\/groups\|groups-directory\|group-detail\|group-roster\|group-health/i |
| 13 | Plan Pipeline | inferred | top files matched /admin\/plan\|prospect\|planning\|launch-planning\|scenario/i |
| 14 | Group Management UI | inferred | top files matched /admin\/groups\|groups-directory\|group-detail\|group-roster\|group-health/i |
| 15 | Group Management UI | inferred | top files matched /admin\/groups\|groups-directory\|group-detail\|group-roster\|group-health/i |
| 16 | Admin Dashboard Widgets | inferred | top files matched /components\/lg\/admin\/dashboard\|lib\/dashboard/i |
| 17 | Multiplication Readiness | inferred | top files matched /multiply\|multiplication\|pillar\|readiness\|capacity\|candidate\|apprentice/i |
| 18 | Admin Form Components | inferred | top files matched /components\/admin\/forms\|lib\/forms\|action-form\|confirm-action/i |
| 19 | Admin Validation | inferred | top files matched /lib\/admin\/validation\//i |
| 20 | Supabase Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 21 | Supabase Multiplication Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 22 | Admin RPC Layer | inferred | top files matched /lib\/admin\/rpc\.ts\|lib\/shared\/rpc\.ts\|rpc\(\)\|safeRpc/i |
| 23 | Supabase Care Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 24 | Admin Form Components | inferred | top files matched /components\/admin\/forms\|lib\/forms\|action-form\|confirm-action/i |
| 25 | Calendar Pages | inferred | top files matched /calendar\|occurrence\|event\|schedule/i |
| 26 | Admin Form Components | inferred | top files matched /components\/admin\/forms\|lib\/forms\|action-form\|confirm-action/i |
| 27 | Private Notes Crypto | inferred | top files matched /lib\/crypto\|private-notes-session\|sealed-note\|passkey/i |
| 28 | Admin Validation | inferred | top files matched /lib\/admin\/validation\//i |
| 29 | Supabase Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 30 | Settings Actions | inferred | top files matched /settings\/actions\|settings_\|group-category\|metric-default\|readiness-rule/i |
| 31 | Admin Validation | inferred | top files matched /lib\/admin\/validation\//i |
| 32 | Supabase Care Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 33 | Check Ins and Attendance | inferred | top files matched /check-ins\|check_ins\|attendance/i |
| 34 | Admin RPC Layer | inferred | top files matched /lib\/admin\/rpc\.ts\|lib\/shared\/rpc\.ts\|rpc\(\)\|safeRpc/i |
| 35 | Auth Flow | inferred | top files matched /(^\|\/)lib\/auth\/\|(^\|\/)app\/(login\|auth\|invite\|forgot-password\|reset-password)\/\|logoutAction\|require[A-Za-z]+Session\|middleware\.ts/i |
| 36 | Supabase Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 37 | Supabase Care Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 38 | Auth Flow | inferred | top files matched /(^\|\/)lib\/auth\/\|(^\|\/)app\/(login\|auth\|invite\|forgot-password\|reset-password)\/\|logoutAction\|require[A-Za-z]+Session\|middleware\.ts/i |
| 39 | Admin RPC Layer | inferred | top files matched /lib\/admin\/rpc\.ts\|lib\/shared\/rpc\.ts\|rpc\(\)\|safeRpc/i |

## Top Files Per Community
### Admin RPC Layer (0)
- lib/admin/rpc.ts (52)
- app/(protected)/admin/settings/actions.ts (22)
- lib/shared/rpc.ts (6)
- lib/over-shepherd/rpc.ts (3)
- lib/shared/uuid.ts (2)
- lib/usage/rpc.ts (2)

### Group Management UI (1)
- app/(protected)/admin/multiply/page.tsx (5)
- app/(protected)/admin/check-ins/[groupId]/page.tsx (4)
- app/(protected)/admin/check-ins/page.tsx (4)
- app/(protected)/admin/page.tsx (3)
- app/(protected)/admin/shepherd-care/over-shepherds/page.tsx (3)
- components/lg/PageHeader.tsx (3)

### Group Management UI (2)
- components/admin/groups-directory.tsx (39)
- lib/dashboard/groups-table-prefs.ts (10)
- lib/dashboard/group-status.ts (7)
- lib/dashboard/labels.ts (3)
- components/admin/group-management-shell.tsx (2)
- lib/admin/metrics.ts (1)

### Admin Form Components (3)
- components/admin/forms/field-styles.ts (4)
- components/admin/follow-ups/follow-up-status-controls.tsx (3)
- components/admin/forms/action-form.tsx (3)
- components/admin/forms/change-leader-role-form.tsx (3)
- app/(protected)/admin/shepherd-care/actions.ts (2)
- components/admin/attention-reset-entity-button.tsx (2)

### Admin RPC Layer (4)
- app/(protected)/admin/shepherd-care/actions.ts (43)
- lib/admin/rpc.ts (6)
- components/admin/shepherd-care/private-notes-section.tsx (2)
- lib/admin/private-notes-session.ts (2)
- lib/crypto/private-notes.ts (1)

### Admin RPC Layer (5)
- components/leader/check-in-form.tsx (12)
- components/admin/person-detail/person-detail-shell.tsx (9)
- components/admin/person-detail/person-tabs.ts (4)
- components/admin/group-detail/group-roster-manager.tsx (3)
- components/admin/super-admin-collapsible-section.tsx (3)
- lib/admin/rpc.ts (3)

### Admin Validation (6)
- lib/admin/validation/people.ts (23)
- lib/admin/validation/super-admin.ts (12)
- lib/admin/validation/prospects.ts (11)
- app/(protected)/admin/people/actions.ts (2)
- lib/admin/validation/shared.ts (2)

### Plan Pipeline (7)
- components/lg/admin/dashboard/overview-primitives.tsx (7)
- components/lg/admin/dashboard/LaunchPlanningOverviewCard.tsx (4)
- lib/dashboard/types.ts (4)
- components/lg/admin/dashboard/GuestPipelineFunnelCard.tsx (3)
- components/lg/admin/dashboard/InterestFunnelOverviewCard.tsx (3)
- components/lg/admin/dashboard/LeaderPipelineOverviewCard.tsx (3)

### Admin People Actions (8)
- app/a11y-harness/harness-client.tsx (34)
- components/admin/people-management-shell.tsx (5)
- components/admin/people/people-tabs.ts (3)
- app/a11y-harness/page.tsx (2)
- components/admin/super-admin-section-anchors.tsx (1)

### Plan Pipeline (9)
- components/calendar/calendar-month-grid.tsx (5)
- components/pastoral/atoms.tsx (5)
- lib/admin/master-calendar-label.ts (5)
- components/admin/admin-master-calendar-drawer.tsx (4)
- lib/calendar/occurrences.ts (4)
- components/admin/admin-master-calendar-grid.tsx (3)

### Plan Pipeline (10)
- lib/admin/multiplication.ts (19)
- components/admin/multiplication/multiplication-planner.tsx (18)
- lib/admin/audience.ts (5)
- components/admin/launch-planning/launch-planning-data.ts (1)
- components/admin/multiply/multiply-grid.tsx (1)
- lib/admin/capacity-board.ts (1)

### Admin RPC Layer (11)
- lib/admin/group-health.ts (19)
- lib/admin/group-health-read.ts (11)
- app/(protected)/admin/group-health/actions.ts (7)
- lib/admin/rpc.ts (2)
- components/admin/group-health/group-health-data.ts (1)
- components/admin/groups/group-management-data.ts (1)

### Group Management UI (12)
- lib/calendar/occurrences.ts (7)
- app/(protected)/leader/[groupId]/calendar/page.tsx (6)
- app/(protected)/admin/groups/[groupId]/calendar/page.tsx (5)
- app/(protected)/admin/calendar/page.tsx (4)
- app/(protected)/admin/launch-planning/page.tsx (4)
- app/(protected)/admin/planning/page.tsx (4)

### Plan Pipeline (13)
- lib/admin/launch-planning.ts (28)
- components/admin/launch-planning/launch-planning-data.ts (7)
- lib/admin/group-capacity-inputs.ts (3)
- lib/dashboard/launch-planning-snapshot.ts (3)
- lib/admin/capacity-board.ts (1)
- lib/admin/leader-pipeline.ts (1)

### Group Management UI (14)
- components/admin/groups/group-detail-data.ts (19)
- app/(protected)/admin/groups/[groupId]/page.tsx (17)
- lib/dashboard/labels.ts (5)
- lib/admin/editable-copy.ts (1)
- lib/calendar/occurrences.ts (1)

## Label And Edge Controls
- Node labels are hidden by default except hubs.
- Use Show Labels, Hub Labels, Selected Community, Neighbor Labels, and Zoom Labels in graph.html.
- Edge labels are hidden by default. Select an edge or enable Edge Labels to inspect relationship types.
