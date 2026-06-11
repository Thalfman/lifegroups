# Architecture Graph Report - care

Generated: 2026-06-11T16:14:26.428Z

## Summary
- Nodes: 1704
- Edges: 3573
- Communities: 91
- Staged files: 213
- Architecture overview nodes: 13
- Architecture overview edges: 59
- Architecture overview default visible edges: 19
- Community overview nodes: 91
- Community overview edges: 502
- Community overview default visible edges: 98

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
- isUuid() (105) - lib/shared/uuid.ts
- callUuidRpc() (104) - lib/shared/rpc.ts
- read-models.ts (81) - lib/supabase/read-models.ts
- normalizeUuid() (79) - lib/admin/validation/shared.ts
- actions.ts (70) - app/(protected)/admin/shepherd-care/actions.ts
- shepherd-care.ts (55) - lib/admin/validation/shepherd-care.ts
- shepherd-care-reads.ts (48) - lib/supabase/shepherd-care-reads.ts
- readOptionalString() (46) - lib/admin/validation/shared.ts
- types.ts (46) - lib/dashboard/types.ts
- launch-planning.ts (45) - lib/admin/launch-planning.ts
- page.tsx (43) - app/(protected)/admin/care/page.tsx

## Largest Communities
- Admin RPC Layer (59 nodes, inferred)
- Admin RPC Layer (58 nodes, inferred)
- Auth Flow (56 nodes, inferred)
- Supabase Data Access (52 nodes, inferred)
- Admin Validation (38 nodes, inferred)
- Private Notes Crypto (38 nodes, inferred)
- Admin Validation (38 nodes, inferred)
- Shepherd Care Workflows (35 nodes, inferred)
- Admin Validation (32 nodes, inferred)
- Admin Form Components (32 nodes, inferred)
- Plan Pipeline (32 nodes, inferred)
- Admin Dashboard Widgets (32 nodes, inferred)

## Inferred Community Labels
| ID | Label | Source | Basis |
| --- | --- | --- | --- |
| 0 | Admin RPC Layer | inferred | top files matched /lib\/admin\/rpc\.ts\|lib\/shared\/rpc\.ts\|rpc\(\)\|safeRpc/i |
| 1 | Admin RPC Layer | inferred | top files matched /lib\/admin\/rpc\.ts\|lib\/shared\/rpc\.ts\|rpc\(\)\|safeRpc/i |
| 2 | Auth Flow | inferred | top files matched /(^\|\/)lib\/auth\/\|(^\|\/)app\/(login\|auth\|invite\|forgot-password\|reset-password)\/\|logoutAction\|require[A-Za-z]+Session\|middleware\.ts/i |
| 3 | Supabase Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 4 | Admin Validation | inferred | top files matched /lib\/admin\/validation\//i |
| 5 | Private Notes Crypto | inferred | top files matched /lib\/crypto\|private-notes-session\|sealed-note\|passkey/i |
| 6 | Admin Validation | inferred | top files matched /lib\/admin\/validation\//i |
| 7 | Shepherd Care Workflows | inferred | top files matched /shepherd-care\|over-shepherd\|shepherd_care\|leader-health\|coverage/i |
| 8 | Admin Validation | inferred | top files matched /lib\/admin\/validation\//i |
| 9 | Admin Form Components | inferred | top files matched /components\/admin\/forms\|lib\/forms\|action-form\|confirm-action/i |
| 10 | Plan Pipeline | inferred | top files matched /admin\/plan\|prospect\|planning\|launch-planning\|scenario/i |
| 11 | Admin Dashboard Widgets | inferred | top files matched /components\/lg\/admin\/dashboard\|lib\/dashboard/i |
| 12 | Supabase Care Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 13 | Multiplication Readiness | inferred | top files matched /multiply\|multiplication\|pillar\|readiness\|capacity\|candidate\|apprentice/i |
| 14 | Admin Action Runner | inferred | top files matched /lib\/admin\/run-action\|lib\/shared\/run-action\|lib\/admin\/action-result\|lib\/shared\/action-result\|runAction/i |
| 15 | Admin Validation | inferred | top files matched /lib\/admin\/validation\//i |
| 16 | Admin Action Runner | inferred | top files matched /lib\/admin\/run-action\|lib\/shared\/run-action\|lib\/admin\/action-result\|lib\/shared\/action-result\|runAction/i |
| 17 | Leader Workspace | inferred | top files matched /leader\/\|leader-\|leader_/i |
| 18 | Multiplication Readiness | inferred | top files matched /multiply\|multiplication\|pillar\|readiness\|capacity\|candidate\|apprentice/i |
| 19 | Admin Action Runner | inferred | top files matched /lib\/admin\/run-action\|lib\/shared\/run-action\|lib\/admin\/action-result\|lib\/shared\/action-result\|runAction/i |
| 20 | Supabase Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 21 | Supabase Care Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 22 | Admin Validation | inferred | top files matched /lib\/admin\/validation\//i |
| 23 | Admin Dashboard Widgets | inferred | top files matched /components\/lg\/admin\/dashboard\|lib\/dashboard/i |
| 24 | Supabase Care Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 25 | Admin Validation | inferred | top files matched /lib\/admin\/validation\//i |
| 26 | Lib Admin | inferred | dominant folder lib/admin |
| 27 | Plan Pipeline | inferred | matched /admin\/plan\|prospect\|planning\|launch-planning\|scenario/i |
| 28 | Supabase Care Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 29 | Shepherd Care Workflows | inferred | top files matched /shepherd-care\|over-shepherd\|shepherd_care\|leader-health\|coverage/i |
| 30 | Supabase Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 31 | Group Management UI | inferred | top files matched /admin\/groups\|groups-directory\|group-detail\|group-roster\|group-health/i |
| 32 | Admin RPC Layer | inferred | top files matched /lib\/admin\/rpc\.ts\|lib\/shared\/rpc\.ts\|rpc\(\)\|safeRpc/i |
| 33 | Plan Pipeline | inferred | top files matched /admin\/plan\|prospect\|planning\|launch-planning\|scenario/i |
| 34 | Plan Pipeline | inferred | top files matched /admin\/plan\|prospect\|planning\|launch-planning\|scenario/i |
| 35 | Supabase Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 36 | Admin Form Components | inferred | top files matched /components\/admin\/forms\|lib\/forms\|action-form\|confirm-action/i |
| 37 | Leader Workspace | inferred | top files matched /leader\/\|leader-\|leader_/i |
| 38 | Lib Admin | inferred | dominant folder lib/admin |
| 39 | Supabase Care Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |

## Top Files Per Community
### Admin RPC Layer (0)
- lib/admin/rpc.ts (59)

### Admin RPC Layer (1)
- lib/admin/rpc.ts (57)
- lib/shared/rpc.ts (1)

### Auth Flow (2)
- lib/auth/roles.ts (22)
- lib/admin/care-note-visibility.ts (6)
- components/lg/Avatar.tsx (4)
- components/lg/Icon.tsx (4)
- lib/nav/active-nav.ts (4)
- components/lg/shell/TopBar.tsx (3)

### Supabase Data Access (3)
- lib/supabase/read-models.ts (52)

### Admin Validation (4)
- lib/admin/validation/care-notes.ts (7)
- lib/admin/validation/group-rubric-grade.ts (6)
- lib/admin/validation/guests.ts (5)
- lib/admin/validation/invite-link.ts (5)
- lib/admin/validation/multiplication-pillars.ts (5)
- lib/admin/validation/shared.ts (5)

### Private Notes Crypto (5)
- lib/crypto/private-notes.ts (29)
- lib/admin/private-notes-session.ts (9)

### Admin Validation (6)
- lib/admin/validation/shepherd-care.ts (36)
- app/(protected)/admin/shepherd-care/actions.ts (1)
- lib/crypto/encoding.ts (1)

### Shepherd Care Workflows (7)
- app/(protected)/admin/shepherd-care/actions.ts (35)

### Admin Validation (8)
- lib/admin/validation/groups.ts (16)
- lib/admin/validation/group-categories.ts (10)
- lib/admin/validation/shared.ts (2)
- types/enums.ts (2)
- lib/admin/audience.ts (1)
- lib/admin/validation/readiness-rule.ts (1)

### Admin Form Components (9)
- lib/admin/care-note-feed.ts (11)
- lib/supabase/care-note-feed-reads.ts (10)
- components/admin/care/notes-feed-shell.tsx (6)
- components/admin/care/notes-feed-data.ts (4)
- components/admin/forms/field-styles.ts (1)

### Plan Pipeline (10)
- lib/admin/launch-planning.ts (31)
- lib/admin/leader-pipeline.ts (1)

### Admin Dashboard Widgets (11)
- lib/dashboard/types.ts (32)

### Supabase Care Data Access (12)
- lib/supabase/shepherd-care-reads.ts (31)
- lib/supabase/read-core.ts (1)

### Multiplication Readiness (13)
- lib/admin/cell-readiness.ts (31)

### Admin Validation (15)
- lib/admin/validation/launch-planning.ts (27)
- lib/admin/validation/shared.ts (1)

## Label And Edge Controls
- Raw graph node labels are hidden by default except hubs.
- Use Show Labels, Hub Labels, Selected Community, Neighbor Labels, and Zoom Labels in graph.html.
- Edge labels are hidden by default. Select an edge or enable Edge Labels to inspect relationship types.
