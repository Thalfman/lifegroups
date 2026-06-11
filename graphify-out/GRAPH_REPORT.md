# Architecture Graph Report - full

Generated: 2026-06-11T18:29:59.547Z

## Summary
- Nodes: 3546
- Edges: 8287
- Communities: 161
- Staged files: 624
- Architecture overview nodes: 13
- Architecture overview edges: 109
- Architecture overview default visible edges: 34
- Community overview nodes: 161
- Community overview edges: 1268
- Community overview default visible edges: 270

## Exclusion Audit
- OK: node_modules: 0
- OK: app/a11y-harness: 0
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
- useActionForm() (96) - components/admin/forms/action-form.tsx
- groups-directory.tsx (95) - components/admin/groups-directory.tsx
- super-admin-console.tsx (84) - components/admin/super-admin-console.tsx
- read-models.ts (81) - lib/supabase/read-models.ts
- queries.ts (75) - lib/dashboard/queries.ts
- actions.ts (70) - app/(protected)/admin/shepherd-care/actions.ts
- admin-group-model.ts (68) - lib/dashboard/admin-group-model.ts

## Largest Communities
- Admin Form Components (66 nodes, inferred)
- Admin RPC Layer (65 nodes, inferred)
- Admin Form Components (52 nodes, inferred)
- Plan Pipeline (51 nodes, inferred)
- Group Management UI (49 nodes, inferred)
- Admin Form Components (48 nodes, inferred)
- Admin RPC Layer (47 nodes, inferred)
- Supabase Care Data Access (46 nodes, inferred)
- Admin RPC Layer (43 nodes, inferred)
- Multiplication Readiness (42 nodes, inferred)
- Admin Dashboard Widgets (42 nodes, inferred)
- Group Management UI (41 nodes, inferred)

## Inferred Community Labels
| ID | Label | Source | Basis |
| --- | --- | --- | --- |
| 0 | Admin Form Components | inferred | top files matched /components\/admin\/forms\|lib\/forms\|action-form\|confirm-action/i |
| 1 | Admin RPC Layer | inferred | top files matched /lib\/admin\/rpc\.ts\|lib\/shared\/rpc\.ts\|rpc\(\)\|safeRpc/i |
| 2 | Admin Form Components | inferred | top files matched /components\/admin\/forms\|lib\/forms\|action-form\|confirm-action/i |
| 3 | Plan Pipeline | inferred | top files matched /admin\/plan\|prospect\|planning\|launch-planning\|scenario/i |
| 4 | Group Management UI | inferred | top files matched /admin\/groups\|groups-directory\|group-detail\|group-roster\|group-health/i |
| 5 | Admin Form Components | inferred | top files matched /components\/admin\/forms\|lib\/forms\|action-form\|confirm-action/i |
| 6 | Admin RPC Layer | inferred | top files matched /lib\/admin\/rpc\.ts\|lib\/shared\/rpc\.ts\|rpc\(\)\|safeRpc/i |
| 7 | Supabase Care Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 8 | Admin RPC Layer | inferred | top files matched /lib\/admin\/rpc\.ts\|lib\/shared\/rpc\.ts\|rpc\(\)\|safeRpc/i |
| 9 | Multiplication Readiness | inferred | top files matched /multiply\|multiplication\|pillar\|readiness\|capacity\|candidate\|apprentice/i |
| 10 | Admin Dashboard Widgets | inferred | top files matched /components\/lg\/admin\/dashboard\|lib\/dashboard/i |
| 11 | Group Management UI | inferred | top files matched /admin\/groups\|groups-directory\|group-detail\|group-roster\|group-health/i |
| 12 | Admin Form Components | inferred | top files matched /components\/admin\/forms\|lib\/forms\|action-form\|confirm-action/i |
| 13 | Group Management UI | inferred | top files matched /admin\/groups\|groups-directory\|group-detail\|group-roster\|group-health/i |
| 14 | Admin Validation | inferred | top files matched /lib\/admin\/validation\//i |
| 15 | Plan Pipeline | inferred | top files matched /admin\/plan\|prospect\|planning\|launch-planning\|scenario/i |
| 16 | Multiplication Readiness | inferred | top files matched /multiply\|multiplication\|pillar\|readiness\|capacity\|candidate\|apprentice/i |
| 17 | Admin Form Components | inferred | top files matched /components\/admin\/forms\|lib\/forms\|action-form\|confirm-action/i |
| 18 | Supabase Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 19 | Multiplication Readiness | inferred | top files matched /multiply\|multiplication\|pillar\|readiness\|capacity\|candidate\|apprentice/i |
| 20 | Admin Form Components | inferred | top files matched /components\/admin\/forms\|lib\/forms\|action-form\|confirm-action/i |
| 21 | Supabase Plan Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 22 | Supabase Care Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 23 | Supabase Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 24 | Supabase Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 25 | Supabase Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 26 | Admin Validation | inferred | top files matched /lib\/admin\/validation\//i |
| 27 | Supabase Plan Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 28 | Supabase Care Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 29 | Admin Validation | inferred | top files matched /lib\/admin\/validation\//i |
| 30 | Plan Pipeline | inferred | top files matched /admin\/plan\|prospect\|planning\|launch-planning\|scenario/i |
| 31 | Private Notes Crypto | inferred | top files matched /lib\/crypto\|private-notes-session\|sealed-note\|passkey/i |
| 32 | Calendar Pages | inferred | top files matched /calendar\|occurrence\|event\|schedule/i |
| 33 | Admin Validation | inferred | top files matched /lib\/admin\/validation\//i |
| 34 | Check Ins and Attendance | inferred | top files matched /check-ins\|check_ins\|attendance/i |
| 35 | Admin Form Components | inferred | top files matched /components\/admin\/forms\|lib\/forms\|action-form\|confirm-action/i |
| 36 | Group Management UI | inferred | top files matched /admin\/groups\|groups-directory\|group-detail\|group-roster\|group-health/i |
| 37 | Admin Form Components | inferred | top files matched /components\/admin\/forms\|lib\/forms\|action-form\|confirm-action/i |
| 38 | Admin RPC Layer | inferred | top files matched /lib\/admin\/rpc\.ts\|lib\/shared\/rpc\.ts\|rpc\(\)\|safeRpc/i |
| 39 | Care Notes and Follow Ups | inferred | top files matched /care-note\|care_notes\|follow-up\|follow_ups\|private-notes\|private_notes/i |

## Top Files Per Community
### Admin Form Components (0)
- components/admin/super-admin-console-shell.tsx (32)
- lib/admin/audit-summary.ts (9)
- components/admin/audit-trail-section.tsx (4)
- components/admin/console-status.tsx (4)
- components/admin/danger-zone-console.tsx (4)
- components/admin/system-status-checklist.tsx (4)

### Admin RPC Layer (1)
- app/(protected)/admin/shepherd-care/actions.ts (35)
- lib/admin/rpc.ts (17)
- app/(protected)/admin/super-admin/coverage-actions.ts (5)
- lib/over-shepherd/rpc.ts (3)
- lib/shared/rpc.ts (2)
- lib/usage/rpc.ts (2)

### Admin Form Components (2)
- components/admin/forms/field-styles.ts (4)
- components/admin/forms/action-form.tsx (3)
- components/admin/forms/change-leader-role-form.tsx (3)
- components/admin/attention-reset-entity-button.tsx (2)
- components/admin/care/group-rubric-grade-entry.tsx (2)
- components/admin/forms/coverage-assign-form.tsx (2)

### Plan Pipeline (3)
- components/lg/admin/dashboard/overview-primitives.tsx (7)
- lib/dashboard/types.ts (7)
- components/lg/admin/dashboard/LaunchPlanningOverviewCard.tsx (4)
- components/lg/admin/dashboard/GuestPipelineFunnelCard.tsx (3)
- components/lg/admin/dashboard/InterestFunnelOverviewCard.tsx (3)
- components/lg/admin/dashboard/LeaderPipelineOverviewCard.tsx (3)

### Group Management UI (4)
- components/admin/groups-directory.tsx (39)
- lib/dashboard/groups-table-prefs.ts (10)

### Admin Form Components (5)
- components/admin/person-detail/person-detail-shell.tsx (11)
- components/admin/person-detail/person-tabs.ts (4)
- components/admin/super-admin-console-shell.tsx (4)
- components/admin/group-detail/group-roster-manager.tsx (3)
- components/admin/super-admin-collapsible-section.tsx (3)
- lib/forms/action-form-view.ts (3)

### Admin RPC Layer (6)
- lib/admin/rpc.ts (33)
- app/(protected)/admin/plan/actions.ts (8)
- lib/shared/rpc.ts (4)
- lib/shared/uuid.ts (2)

### Supabase Care Data Access (7)
- lib/admin/care-note-feed.ts (11)
- lib/supabase/care-note-feed-reads.ts (10)
- app/(protected)/admin/care/page.tsx (8)
- components/admin/care/notes-feed-data.ts (6)
- components/admin/care/notes-feed-shell.tsx (6)
- app/(protected)/admin/follow-ups/page.tsx (2)

### Admin RPC Layer (8)
- app/(protected)/admin/shepherd-care/actions.ts (12)
- app/(protected)/admin/shepherd-care/care-notes-actions.ts (10)
- app/(protected)/admin/settings/actions.ts (4)
- components/admin/shepherd-care/care-follow-up-status-controls.tsx (4)
- lib/admin/rpc.ts (4)
- components/admin/shepherd-care/coverage-assignment-form.tsx (2)

### Multiplication Readiness (9)
- lib/admin/multiplication.ts (18)
- components/admin/multiplication/multiplication-planner.tsx (17)
- lib/admin/audience.ts (5)
- components/admin/multiply/multiply-grid.tsx (1)
- lib/admin/capacity-board.ts (1)

### Admin Dashboard Widgets (10)
- lib/dashboard/types.ts (20)
- lib/dashboard/admin-group-model.ts (19)
- types/enums.ts (2)
- lib/admin/metrics.ts (1)

### Group Management UI (11)
- app/(protected)/admin/check-ins/[groupId]/page.tsx (4)
- app/(protected)/admin/check-ins/page.tsx (4)
- app/(protected)/admin/shepherd-care/over-shepherds/page.tsx (3)
- components/lg/PageHeader.tsx (3)
- lib/admin/check-ins.ts (3)
- app/(protected)/admin/group-health/page.tsx (2)

### Admin Form Components (12)
- components/admin/settings/groups-catalog-editor.tsx (20)
- lib/admin/group-type-list.ts (8)
- components/admin/forms/group-category-options.ts (5)
- components/admin/forms/meeting-schedule-options.ts (3)
- components/admin/forms/group-edit-form.tsx (2)
- types/enums.ts (2)

### Group Management UI (13)
- lib/calendar/occurrences.ts (7)
- app/(protected)/leader/[groupId]/calendar/page.tsx (6)
- app/(protected)/admin/groups/[groupId]/calendar/page.tsx (5)
- app/(protected)/admin/calendar/page.tsx (4)
- app/(protected)/admin/launch-planning/page.tsx (4)
- components/admin/planning/planning-calendar-panel.tsx (4)

### Plan Pipeline (15)
- components/admin/admin-master-calendar-grid.tsx (5)
- components/calendar/calendar-month-grid.tsx (5)
- lib/admin/master-calendar-label.ts (5)
- components/admin/admin-master-calendar-drawer.tsx (4)
- components/admin/planning/planning-by-leader-list.tsx (4)
- lib/calendar/occurrences.ts (4)

## Label And Edge Controls
- The default graph.html is architecture-overview.html, not the raw full graph.
- Raw Full Graph is kept as raw-full-graph.html for deep inspection only.
- Community Overview is kept as community-overview.html with original community IDs in details.
- Raw graph node labels are hidden by default except hubs.
- Use Show Labels, Hub Labels, Selected Community, Neighbor Labels, and Zoom Labels in graph.html.
- Edge labels are hidden by default. Select an edge or enable Edge Labels to inspect relationship types.
