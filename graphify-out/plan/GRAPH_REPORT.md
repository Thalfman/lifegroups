# Architecture Graph Report - plan

Generated: 2026-06-11T15:08:15.513Z

## Summary
- Nodes: 1499
- Edges: 3043
- Communities: 67
- Staged files: 138

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
- callUuidRpc() (93) - lib/shared/rpc.ts
- read-models.ts (82) - lib/supabase/read-models.ts
- wrapError() (81) - lib/supabase/read-core.ts
- normalizeUuid() (79) - lib/admin/validation/shared.ts
- admin-group-model.ts (66) - lib/dashboard/admin-group-model.ts
- check-ins.ts (66) - lib/admin/check-ins.ts
- shepherd-care.ts (54) - lib/admin/validation/shepherd-care.ts
- launch-planning-data.ts (50) - components/admin/launch-planning/launch-planning-data.ts
- multiplication-planner.tsx (49) - components/admin/multiplication/multiplication-planner.tsx
- shepherd-care-reads.ts (48) - lib/supabase/shepherd-care-reads.ts
- types.ts (48) - lib/dashboard/types.ts

## Largest Communities
- Admin Validation (67 nodes, inferred)
- Admin RPC Layer (62 nodes, inferred)
- Admin Action Runner (61 nodes, inferred)
- Admin RPC Layer (59 nodes, inferred)
- Plan Pipeline (54 nodes, inferred)
- Supabase Data Access (48 nodes, inferred)
- Supabase Plan Data Access (47 nodes, inferred)
- Admin Validation (47 nodes, inferred)
- Admin Validation (45 nodes, inferred)
- Supabase Plan Data Access (43 nodes, inferred)
- Supabase Care Data Access (42 nodes, inferred)
- Admin Validation (37 nodes, inferred)

## Inferred Community Labels
| ID | Label | Source | Basis |
| --- | --- | --- | --- |
| 0 | Admin Validation | inferred | top files matched /lib\/admin\/validation\//i |
| 1 | Admin RPC Layer | inferred | top files matched /lib\/admin\/rpc\.ts\|lib\/shared\/rpc\.ts\|rpc\(\)\|safeRpc/i |
| 2 | Admin Action Runner | inferred | top files matched /lib\/admin\/run-action\|lib\/shared\/run-action\|lib\/admin\/action-result\|lib\/shared\/action-result\|runAction/i |
| 3 | Admin RPC Layer | inferred | top files matched /lib\/admin\/rpc\.ts\|lib\/shared\/rpc\.ts\|rpc\(\)\|safeRpc/i |
| 4 | Plan Pipeline | inferred | top files matched /admin\/plan\|prospect\|planning\|launch-planning\|scenario/i |
| 5 | Supabase Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 6 | Supabase Plan Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 7 | Admin Validation | inferred | top files matched /lib\/admin\/validation\//i |
| 8 | Admin Validation | inferred | top files matched /lib\/admin\/validation\//i |
| 9 | Supabase Plan Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 10 | Supabase Care Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 11 | Admin Validation | inferred | top files matched /lib\/admin\/validation\//i |
| 12 | Multiplication Readiness | inferred | top files matched /multiply\|multiplication\|pillar\|readiness\|capacity\|candidate\|apprentice/i |
| 13 | Admin Validation | inferred | top files matched /lib\/admin\/validation\//i |
| 14 | Supabase Calendar Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 15 | Supabase Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 16 | Supabase Plan Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 17 | Admin Validation | inferred | top files matched /lib\/admin\/validation\//i |
| 18 | Admin Validation | inferred | top files matched /lib\/admin\/validation\//i |
| 19 | Plan Pipeline | inferred | top files matched /admin\/plan\|prospect\|planning\|launch-planning\|scenario/i |
| 20 | Admin Dashboard Widgets | inferred | top files matched /components\/lg\/admin\/dashboard\|lib\/dashboard/i |
| 21 | Admin Dashboard Widgets | inferred | top files matched /components\/lg\/admin\/dashboard\|lib\/dashboard/i |
| 22 | Plan Pipeline | inferred | top files matched /admin\/plan\|prospect\|planning\|launch-planning\|scenario/i |
| 23 | Calendar Pages | inferred | top files matched /calendar\|occurrence\|event\|schedule/i |
| 24 | Lib Admin | inferred | dominant folder lib/admin |
| 25 | Calendar Pages | inferred | matched /calendar\|occurrence\|event\|schedule/i |
| 26 | Auth Flow | inferred | top files matched /(^\|\/)lib\/auth\/\|(^\|\/)app\/(login\|auth\|invite\|forgot-password\|reset-password)\/\|logoutAction\|require[A-Za-z]+Session\|middleware\.ts/i |
| 27 | Plan Pipeline | inferred | top files matched /admin\/plan\|prospect\|planning\|launch-planning\|scenario/i |
| 28 | Plan Pipeline | inferred | top files matched /admin\/plan\|prospect\|planning\|launch-planning\|scenario/i |
| 29 | Admin Validation | inferred | top files matched /lib\/admin\/validation\//i |
| 30 | Calendar Pages | inferred | top files matched /calendar\|occurrence\|event\|schedule/i |
| 31 | Supabase Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 32 | Plan Pipeline | inferred | top files matched /admin\/plan\|prospect\|planning\|launch-planning\|scenario/i |
| 33 | Admin Action Runner | inferred | top files matched /lib\/admin\/run-action\|lib\/shared\/run-action\|lib\/admin\/action-result\|lib\/shared\/action-result\|runAction/i |
| 34 | Supabase Plan Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 35 | Admin Form Components | inferred | top files matched /components\/admin\/forms\|lib\/forms\|action-form\|confirm-action/i |
| 36 | Multiplication Readiness | inferred | matched /multiply\|multiplication\|pillar\|readiness\|capacity\|candidate\|apprentice/i |
| 37 | Plan Pipeline | inferred | top files matched /admin\/plan\|prospect\|planning\|launch-planning\|scenario/i |
| 38 | Supabase Plan Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 39 | Admin Validation | inferred | top files matched /lib\/admin\/validation\//i |

## Top Files Per Community
### Admin Validation (0)
- lib/admin/cell-readiness.ts (31)
- lib/supabase/group-categories-reads.ts (14)
- lib/admin/validation/group-categories.ts (9)
- lib/admin/validation/readiness-rule.ts (9)
- lib/admin/validation/groups.ts (2)
- lib/admin/audience.ts (1)

### Admin RPC Layer (1)
- lib/admin/rpc.ts (61)
- lib/shared/rpc.ts (1)

### Admin Action Runner (2)
- lib/auth/session.ts (21)
- lib/admin/run-action.ts (7)
- lib/shared/run-action.ts (7)
- lib/observability/logger.ts (6)
- lib/observability/identifiers.ts (4)
- lib/observability/instrument.ts (4)

### Admin RPC Layer (3)
- lib/admin/rpc.ts (59)

### Plan Pipeline (4)
- components/admin/launch-planning/scenarios-panel.tsx (13)
- components/admin/launch-planning/results-panel.tsx (7)
- components/admin/launch-planning/lazy-panels.tsx (6)
- components/admin/launch-planning/summary-cards.tsx (6)
- components/dashboard/cards.tsx (6)
- components/admin/launch-planning/setup-warnings.tsx (5)

### Supabase Data Access (5)
- lib/supabase/read-models.ts (45)
- lib/shared/church-time.ts (2)
- lib/supabase/read-core.ts (1)

### Supabase Plan Data Access (6)
- lib/admin/check-ins.ts (37)
- lib/supabase/read-models.ts (7)
- components/admin/plan/plan-data.ts (1)
- lib/supabase/cached-config.ts (1)
- lib/supabase/reads-seam.ts (1)

### Admin Validation (7)
- lib/admin/multiplication-pillars.ts (28)
- lib/admin/health-rubric.ts (13)
- lib/admin/validation/multiplication-pillars.ts (5)
- types/enums.ts (1)

### Admin Validation (8)
- lib/admin/validation/people.ts (25)
- lib/admin/validation/super-admin.ts (12)
- lib/admin/validation/guests.ts (3)
- lib/admin/validation/shared.ts (3)
- lib/admin/validation/prospects.ts (2)

### Supabase Plan Data Access (9)
- components/admin/multiplication/multiplication-planner.tsx (19)
- lib/admin/multiplication.ts (17)
- lib/admin/audience.ts (5)
- lib/supabase/read-models.ts (1)
- types/enums.ts (1)

### Supabase Care Data Access (10)
- lib/supabase/shepherd-care-reads.ts (33)
- lib/admin/shepherd-care-cadence.ts (8)
- lib/supabase/read-core.ts (1)

### Admin Validation (11)
- lib/admin/validation/shepherd-care.ts (35)
- lib/crypto/encoding.ts (1)
- types/enums.ts (1)

### Multiplication Readiness (12)
- lib/admin/capacity-board.ts (16)
- components/admin/capacity-board/capacity-board.tsx (6)
- lib/admin/metrics.ts (4)
- lib/admin/multiplication.ts (4)
- lib/admin/group-capacity-inputs.ts (3)
- lib/admin/cell-readiness.ts (1)

### Admin Validation (13)
- lib/admin/validation/group-rubric-grade.ts (6)
- lib/admin/validation/leader-health.ts (6)
- lib/admin/validation/health-rubric.ts (5)
- lib/admin/validation/invite-link.ts (5)
- lib/admin/validation/guests.ts (3)
- lib/admin/validation/shared.ts (3)

### Supabase Calendar Data Access (14)
- lib/calendar/occurrences.ts (22)
- lib/admin/master-calendar.ts (6)
- types/enums.ts (3)
- lib/supabase/read-models.ts (2)
- lib/shared/church-time.ts (1)

## Label And Edge Controls
- Node labels are hidden by default except hubs.
- Use Show Labels, Hub Labels, Selected Community, Neighbor Labels, and Zoom Labels in graph.html.
- Edge labels are hidden by default. Select an edge or enable Edge Labels to inspect relationship types.
