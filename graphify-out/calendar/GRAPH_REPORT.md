# Architecture Graph Report - calendar

Generated: 2026-06-11T16:14:26.485Z

## Summary
- Nodes: 1498
- Edges: 3103
- Communities: 69
- Staged files: 153
- Architecture overview nodes: 13
- Architecture overview edges: 55
- Architecture overview default visible edges: 18
- Community overview nodes: 69
- Community overview edges: 382
- Community overview default visible edges: 92

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
- callUuidRpc() (102) - lib/shared/rpc.ts
- read-models.ts (82) - lib/supabase/read-models.ts
- wrapError() (75) - lib/supabase/read-core.ts
- check-ins.ts (66) - lib/admin/check-ins.ts
- shepherd-care.ts (54) - lib/admin/validation/shepherd-care.ts
- launch-planning-data.ts (50) - components/admin/launch-planning/launch-planning-data.ts
- multiplication-planner.tsx (49) - components/admin/multiplication/multiplication-planner.tsx
- shepherd-care-reads.ts (48) - lib/supabase/shepherd-care-reads.ts
- capacity-board.ts (47) - lib/admin/capacity-board.ts
- launch-planning.ts (45) - lib/admin/launch-planning.ts
- group-categories.ts (41) - lib/admin/validation/group-categories.ts

## Largest Communities
- Admin RPC Layer (61 nodes, inferred)
- Admin RPC Layer (58 nodes, inferred)
- Plan Pipeline (56 nodes, inferred)
- Calendar Pages (56 nodes, inferred)
- Supabase Data Access (54 nodes, inferred)
- Admin Form Components (53 nodes, inferred)
- Admin Action Runner (52 nodes, inferred)
- Admin Validation (47 nodes, inferred)
- Supabase Data Access (45 nodes, inferred)
- Admin Validation (40 nodes, inferred)
- Supabase Plan Data Access (35 nodes, inferred)
- Supabase Care Data Access (34 nodes, inferred)

## Inferred Community Labels
| ID | Label | Source | Basis |
| --- | --- | --- | --- |
| 0 | Admin RPC Layer | inferred | top files matched /lib\/admin\/rpc\.ts\|lib\/shared\/rpc\.ts\|rpc\(\)\|safeRpc/i |
| 1 | Admin RPC Layer | inferred | top files matched /lib\/admin\/rpc\.ts\|lib\/shared\/rpc\.ts\|rpc\(\)\|safeRpc/i |
| 2 | Plan Pipeline | inferred | top files matched /admin\/plan\|prospect\|planning\|launch-planning\|scenario/i |
| 3 | Calendar Pages | inferred | top files matched /calendar\|occurrence\|event\|schedule/i |
| 4 | Supabase Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 5 | Admin Form Components | inferred | top files matched /components\/admin\/forms\|lib\/forms\|action-form\|confirm-action/i |
| 6 | Admin Action Runner | inferred | top files matched /lib\/admin\/run-action\|lib\/shared\/run-action\|lib\/admin\/action-result\|lib\/shared\/action-result\|runAction/i |
| 7 | Admin Validation | inferred | top files matched /lib\/admin\/validation\//i |
| 8 | Supabase Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 9 | Admin Validation | inferred | top files matched /lib\/admin\/validation\//i |
| 10 | Supabase Plan Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 11 | Supabase Care Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 12 | Multiplication Readiness | inferred | top files matched /multiply\|multiplication\|pillar\|readiness\|capacity\|candidate\|apprentice/i |
| 13 | Supabase Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 14 | Supabase Calendar Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 15 | Admin Validation | inferred | top files matched /lib\/admin\/validation\//i |
| 16 | Admin Validation | inferred | top files matched /lib\/admin\/validation\//i |
| 17 | Admin RPC Layer | inferred | top files matched /lib\/admin\/rpc\.ts\|lib\/shared\/rpc\.ts\|rpc\(\)\|safeRpc/i |
| 18 | Calendar Pages | inferred | top files matched /calendar\|occurrence\|event\|schedule/i |
| 19 | Check Ins and Attendance | inferred | top files matched /check-ins\|check_ins\|attendance/i |
| 20 | Plan Pipeline | inferred | top files matched /admin\/plan\|prospect\|planning\|launch-planning\|scenario/i |
| 21 | Admin Validation | inferred | top files matched /lib\/admin\/validation\//i |
| 22 | Admin Validation | inferred | top files matched /lib\/admin\/validation\//i |
| 23 | Calendar Pages | inferred | matched /calendar\|occurrence\|event\|schedule/i |
| 24 | Plan Pipeline | inferred | top files matched /admin\/plan\|prospect\|planning\|launch-planning\|scenario/i |
| 25 | Auth Flow | inferred | top files matched /(^\|\/)lib\/auth\/\|(^\|\/)app\/(login\|auth\|invite\|forgot-password\|reset-password)\/\|logoutAction\|require[A-Za-z]+Session\|middleware\.ts/i |
| 26 | Supabase Plan Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 27 | Admin Validation | inferred | top files matched /lib\/admin\/validation\//i |
| 28 | Admin Action Runner | inferred | top files matched /lib\/admin\/run-action\|lib\/shared\/run-action\|lib\/admin\/action-result\|lib\/shared\/action-result\|runAction/i |
| 29 | Supabase Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 30 | Admin Action Runner | inferred | top files matched /lib\/admin\/run-action\|lib\/shared\/run-action\|lib\/admin\/action-result\|lib\/shared\/action-result\|runAction/i |
| 31 | Admin Form Components | inferred | top files matched /components\/admin\/forms\|lib\/forms\|action-form\|confirm-action/i |
| 32 | Multiplication Readiness | inferred | top files matched /multiply\|multiplication\|pillar\|readiness\|capacity\|candidate\|apprentice/i |
| 33 | Plan Pipeline | inferred | top files matched /admin\/plan\|prospect\|planning\|launch-planning\|scenario/i |
| 34 | Admin Validation | inferred | top files matched /lib\/admin\/validation\//i |
| 35 | Calendar Pages | inferred | top files matched /calendar\|occurrence\|event\|schedule/i |
| 36 | Plan Pipeline | inferred | top files matched /admin\/plan\|prospect\|planning\|launch-planning\|scenario/i |
| 37 | Shared UI Primitives | inferred | top files matched /components\/ui\|segmented-tabs\|button\|badge\|dialog\|shell\|card/i |
| 38 | Check Ins and Attendance | inferred | top files matched /check-ins\|check_ins\|attendance/i |
| 39 | Plan Pipeline | inferred | top files matched /admin\/plan\|prospect\|planning\|launch-planning\|scenario/i |

## Top Files Per Community
### Admin RPC Layer (0)
- lib/admin/rpc.ts (60)
- lib/shared/rpc.ts (1)

### Admin RPC Layer (1)
- lib/admin/rpc.ts (58)

### Plan Pipeline (2)
- components/admin/launch-planning/scenarios-panel.tsx (13)
- components/admin/launch-planning/results-panel.tsx (7)
- components/admin/launch-planning/lazy-panels.tsx (6)
- components/admin/launch-planning/summary-cards.tsx (6)
- components/dashboard/cards.tsx (6)
- lib/admin/launch-planning.ts (6)

### Calendar Pages (3)
- lib/calendar/payload.ts (22)
- lib/leader/rpc.ts (19)
- app/(protected)/leader/[groupId]/calendar/actions.ts (14)
- lib/leader/run-action.ts (1)

### Supabase Data Access (4)
- lib/supabase/read-models.ts (51)
- lib/shared/church-time.ts (2)
- lib/supabase/read-core.ts (1)

### Admin Form Components (5)
- components/admin/forms/field-styles.ts (9)
- components/admin/forms/action-form.tsx (5)
- components/admin/launch-planning/scenario-form.tsx (5)
- components/pastoral/shell-nav.tsx (5)
- components/admin/launch-planning/plan-launch-widget.tsx (4)
- components/admin/launch-planning/assumptions-form.tsx (3)

### Admin Action Runner (6)
- lib/leader/validation.ts (18)
- components/leader/check-in-form.tsx (13)
- app/(protected)/leader/actions.ts (10)
- lib/shared/action-result.ts (5)
- lib/leader/action-result.ts (3)
- lib/admin/action-result.ts (2)

### Admin Validation (7)
- lib/admin/multiplication-pillars.ts (28)
- lib/admin/health-rubric.ts (13)
- lib/admin/validation/multiplication-pillars.ts (5)
- types/enums.ts (1)

### Supabase Data Access (8)
- lib/admin/feature-flags.ts (15)
- lib/admin/app-config-decode.ts (9)
- lib/admin/editable-copy.ts (8)
- components/ui/badge.tsx (6)
- app/(protected)/admin/check-ins/layout.tsx (2)
- lib/admin/frozen-surface.ts (2)

### Admin Validation (9)
- lib/admin/validation/shepherd-care.ts (37)
- types/enums.ts (2)
- lib/crypto/encoding.ts (1)

### Supabase Plan Data Access (10)
- components/admin/multiplication/multiplication-planner.tsx (18)
- lib/admin/multiplication.ts (16)
- lib/supabase/read-models.ts (1)

### Supabase Care Data Access (11)
- lib/supabase/shepherd-care-reads.ts (33)
- lib/supabase/read-core.ts (1)

### Multiplication Readiness (12)
- lib/admin/capacity-board.ts (15)
- components/admin/capacity-board/capacity-board.tsx (6)
- lib/admin/metrics.ts (4)
- lib/admin/multiplication.ts (4)
- lib/admin/group-capacity-inputs.ts (3)
- lib/admin/cell-readiness.ts (1)

### Supabase Data Access (13)
- lib/admin/check-ins.ts (25)
- lib/supabase/read-models.ts (4)
- lib/admin/check-in-due.ts (1)
- lib/supabase/cached-config.ts (1)
- types/enums.ts (1)

### Supabase Calendar Data Access (14)
- lib/calendar/occurrences.ts (7)
- app/(protected)/leader/[groupId]/calendar/page.tsx (6)
- lib/admin/master-calendar.ts (6)
- app/(protected)/admin/groups/[groupId]/calendar/page.tsx (5)
- lib/supabase/read-models.ts (5)
- components/calendar/calendar-archived-actions.tsx (1)

## Label And Edge Controls
- Raw graph node labels are hidden by default except hubs.
- Use Show Labels, Hub Labels, Selected Community, Neighbor Labels, and Zoom Labels in graph.html.
- Edge labels are hidden by default. Select an edge or enable Edge Labels to inspect relationship types.
