# Architecture Graph Report - multiply

Generated: 2026-06-11T18:29:59.821Z

## Summary
- Nodes: 1515
- Edges: 3082
- Communities: 81
- Staged files: 148
- Architecture overview nodes: 13
- Architecture overview edges: 60
- Architecture overview default visible edges: 20
- Community overview nodes: 81
- Community overview edges: 422
- Community overview default visible edges: 73

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
- callUuidRpc() (93) - lib/shared/rpc.ts
- wrapError() (85) - lib/supabase/read-core.ts
- read-models.ts (82) - lib/supabase/read-models.ts
- normalizeUuid() (79) - lib/admin/validation/shared.ts
- shepherd-care.ts (54) - lib/admin/validation/shepherd-care.ts
- launch-planning-data.ts (50) - components/admin/launch-planning/launch-planning-data.ts
- multiplication-planner.tsx (49) - components/admin/multiplication/multiplication-planner.tsx
- shepherd-care-reads.ts (48) - lib/supabase/shepherd-care-reads.ts
- actions.ts (47) - app/(protected)/admin/settings/actions.ts
- capacity-board.ts (47) - lib/admin/capacity-board.ts
- multiplication-config-reads.ts (46) - lib/supabase/multiplication-config-reads.ts

## Largest Communities
- Admin RPC Layer (62 nodes, inferred)
- Admin RPC Layer (59 nodes, inferred)
- Admin Validation (51 nodes, inferred)
- Admin Validation (47 nodes, inferred)
- Supabase Data Access (47 nodes, inferred)
- Supabase Care Data Access (42 nodes, inferred)
- Admin Validation (39 nodes, inferred)
- Admin Validation (36 nodes, inferred)
- Lib Admin (32 nodes, inferred)
- Admin Action Runner (32 nodes, inferred)
- Supabase Plan Data Access (31 nodes, inferred)
- Admin Dashboard Widgets (31 nodes, inferred)

## Inferred Community Labels
| ID | Label | Source | Basis |
| --- | --- | --- | --- |
| 0 | Admin RPC Layer | inferred | top files matched /lib\/admin\/rpc\.ts\|lib\/shared\/rpc\.ts\|rpc\(\)\|safeRpc/i |
| 1 | Admin RPC Layer | inferred | top files matched /lib\/admin\/rpc\.ts\|lib\/shared\/rpc\.ts\|rpc\(\)\|safeRpc/i |
| 2 | Admin Validation | inferred | top files matched /lib\/admin\/validation\//i |
| 3 | Admin Validation | inferred | top files matched /lib\/admin\/validation\//i |
| 4 | Supabase Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 5 | Supabase Care Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 6 | Admin Validation | inferred | top files matched /lib\/admin\/validation\//i |
| 7 | Lib Admin | inferred | dominant folder lib/admin |
| 8 | Admin Action Runner | inferred | top files matched /lib\/admin\/run-action\|lib\/shared\/run-action\|lib\/admin\/action-result\|lib\/shared\/action-result\|runAction/i |
| 9 | Supabase Plan Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 10 | Admin Dashboard Widgets | inferred | top files matched /components\/lg\/admin\/dashboard\|lib\/dashboard/i |
| 11 | Admin Validation | inferred | top files matched /lib\/admin\/validation\//i |
| 12 | Admin Validation | inferred | top files matched /lib\/admin\/validation\//i |
| 13 | Plan Pipeline | inferred | top files matched /admin\/plan\|prospect\|planning\|launch-planning\|scenario/i |
| 14 | Multiplication Readiness | inferred | top files matched /multiply\|multiplication\|pillar\|readiness\|capacity\|candidate\|apprentice/i |
| 15 | Plan Pipeline | inferred | top files matched /admin\/plan\|prospect\|planning\|launch-planning\|scenario/i |
| 16 | Multiplication Readiness | inferred | top files matched /multiply\|multiplication\|pillar\|readiness\|capacity\|candidate\|apprentice/i |
| 17 | Supabase Care Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 18 | Calendar Pages | inferred | top files matched /calendar\|occurrence\|event\|schedule/i |
| 19 | Admin Validation | inferred | top files matched /lib\/admin\/validation\//i |
| 20 | Multiplication Readiness | inferred | top files matched /multiply\|multiplication\|pillar\|readiness\|capacity\|candidate\|apprentice/i |
| 21 | Supabase Multiplication Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 22 | Plan Pipeline | inferred | top files matched /admin\/plan\|prospect\|planning\|launch-planning\|scenario/i |
| 23 | Supabase Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 24 | Admin Validation | inferred | top files matched /lib\/admin\/validation\//i |
| 25 | Multiplication Readiness | inferred | top files matched /multiply\|multiplication\|pillar\|readiness\|capacity\|candidate\|apprentice/i |
| 26 | Supabase Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 27 | Calendar Pages | inferred | top files matched /calendar\|occurrence\|event\|schedule/i |
| 28 | Multiplication Readiness | inferred | top files matched /multiply\|multiplication\|pillar\|readiness\|capacity\|candidate\|apprentice/i |
| 29 | Supabase Multiplication Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 30 | Multiplication Readiness | inferred | top files matched /multiply\|multiplication\|pillar\|readiness\|capacity\|candidate\|apprentice/i |
| 31 | Plan Pipeline | inferred | top files matched /admin\/plan\|prospect\|planning\|launch-planning\|scenario/i |
| 32 | Multiplication Readiness | inferred | top files matched /multiply\|multiplication\|pillar\|readiness\|capacity\|candidate\|apprentice/i |
| 33 | Admin Form Components | inferred | top files matched /components\/admin\/forms\|lib\/forms\|action-form\|confirm-action/i |
| 34 | Supabase Multiplication Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 35 | Multiplication Readiness | inferred | top files matched /multiply\|multiplication\|pillar\|readiness\|capacity\|candidate\|apprentice/i |
| 36 | Plan Pipeline | inferred | top files matched /admin\/plan\|prospect\|planning\|launch-planning\|scenario/i |
| 37 | Multiplication Readiness | inferred | top files matched /multiply\|multiplication\|pillar\|readiness\|capacity\|candidate\|apprentice/i |
| 38 | Shared UI Primitives | inferred | top files matched /components\/ui\|segmented-tabs\|button\|badge\|dialog\|shell\|card/i |
| 39 | Plan Pipeline | inferred | top files matched /admin\/plan\|prospect\|planning\|launch-planning\|scenario/i |

## Top Files Per Community
### Admin RPC Layer (0)
- lib/admin/rpc.ts (61)
- lib/shared/rpc.ts (1)

### Admin RPC Layer (1)
- lib/admin/rpc.ts (59)

### Admin Validation (2)
- lib/admin/validation/people.ts (25)
- lib/admin/validation/super-admin.ts (12)
- lib/admin/validation/prospects.ts (11)
- lib/admin/validation/shared.ts (3)

### Admin Validation (3)
- lib/auth/roles.ts (24)
- lib/auth/session.ts (20)
- lib/admin/validation/people.ts (1)
- lib/auth/leader-surface-flag.ts (1)
- types/enums.ts (1)

### Supabase Data Access (4)
- lib/supabase/read-models.ts (45)
- lib/shared/church-time.ts (2)

### Supabase Care Data Access (5)
- lib/supabase/shepherd-care-reads.ts (33)
- lib/admin/shepherd-care-cadence.ts (8)
- lib/supabase/read-core.ts (1)

### Admin Validation (6)
- lib/admin/validation/shepherd-care.ts (36)
- types/enums.ts (2)
- lib/crypto/encoding.ts (1)

### Admin Validation (11)
- lib/admin/validation/care-notes.ts (6)
- lib/admin/validation/group-rubric-grade.ts (6)
- lib/admin/validation/leader-health.ts (6)
- lib/admin/validation/health-rubric.ts (5)
- lib/admin/validation/multiplication-pillars.ts (5)
- lib/admin/validation/shared.ts (4)

### Lib Admin (7)
- lib/admin/feature-flags.ts (15)
- lib/admin/app-config-decode.ts (9)
- lib/admin/editable-copy.ts (8)

### Admin Action Runner (8)
- app/(protected)/admin/settings/actions.ts (31)
- lib/admin/run-action.ts (1)

### Supabase Plan Data Access (9)
- components/admin/launch-planning/launch-planning-data.ts (10)
- lib/admin/launch-planning.ts (8)
- components/admin/multiply/multiply-plan-data.ts (5)
- lib/supabase/read-models.ts (2)
- components/admin/multiply/multiply-grid-data.ts (1)
- lib/admin/audience.ts (1)

### Admin Dashboard Widgets (10)
- lib/dashboard/types.ts (31)

### Admin Validation (12)
- lib/admin/validation/launch-planning.ts (27)
- lib/admin/validation/shared.ts (2)
- lib/admin/validation/group-categories.ts (1)

### Plan Pipeline (13)
- lib/calendar/occurrences.ts (20)
- lib/shared/church-time.ts (5)
- app/(protected)/admin/launch-planning/page.tsx (4)

### Multiplication Readiness (14)
- lib/admin/capacity-board.ts (15)
- components/admin/capacity-board/capacity-board.tsx (6)
- lib/admin/metrics.ts (4)
- lib/admin/group-capacity-inputs.ts (3)

## Label And Edge Controls
- Raw graph node labels are hidden by default except hubs.
- Use Show Labels, Hub Labels, Selected Community, Neighbor Labels, and Zoom Labels in graph.html.
- Edge labels are hidden by default. Select an edge or enable Edge Labels to inspect relationship types.
