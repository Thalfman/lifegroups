# Architecture Graph Report - domain-auth

Generated: 2026-06-11T16:14:26.526Z

## Summary
- Nodes: 378
- Edges: 602
- Communities: 19
- Staged files: 62
- Architecture overview nodes: 13
- Architecture overview edges: 8
- Architecture overview default visible edges: 3
- Community overview nodes: 19
- Community overview edges: 45
- Community overview default visible edges: 7

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
- read-models.ts (69) - lib/supabase/read-models.ts
- session.ts (29) - lib/auth/session.ts
- enums.ts (28) - types/enums.ts
- roles.ts (25) - lib/auth/roles.ts
- createSupabaseServerClient() (20) - lib/supabase/server.ts
- invite-workflow-form.tsx (20) - components/admin/forms/invite-workflow-form.tsx
- field-styles.ts (13) - components/admin/forms/field-styles.ts
- shared.ts (13) - lib/admin/validation/shared.ts
- actions.ts (12) - app/login/actions.ts
- page.tsx (12) - app/invite/[token]/page.tsx
- atoms.tsx (11) - components/pastoral/atoms.tsx
- button.tsx (11) - components/pastoral/button.tsx

## Largest Communities
- Supabase Data Access (48 nodes, inferred)
- Admin Form Components (39 nodes, inferred)
- Supabase Data Access (33 nodes, inferred)
- Admin RPC Layer (32 nodes, inferred)
- Auth Flow (30 nodes, inferred)
- Auth Flow (28 nodes, inferred)
- Plan Pipeline (27 nodes, inferred)
- Auth Flow (24 nodes, inferred)
- Admin Action Runner (21 nodes, inferred)
- Auth Flow (19 nodes, inferred)
- Admin Validation (19 nodes, inferred)
- Shared UI Primitives (17 nodes, inferred)

## Inferred Community Labels
| ID | Label | Source | Basis |
| --- | --- | --- | --- |
| 0 | Supabase Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 1 | Admin Form Components | inferred | top files matched /components\/admin\/forms\|lib\/forms\|action-form\|confirm-action/i |
| 2 | Supabase Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 3 | Admin RPC Layer | inferred | top files matched /lib\/admin\/rpc\.ts\|lib\/shared\/rpc\.ts\|rpc\(\)\|safeRpc/i |
| 4 | Auth Flow | inferred | top files matched /(^\|\/)lib\/auth\/\|(^\|\/)app\/(login\|auth\|invite\|forgot-password\|reset-password)\/\|logoutAction\|require[A-Za-z]+Session\|middleware\.ts/i |
| 5 | Auth Flow | inferred | top files matched /(^\|\/)lib\/auth\/\|(^\|\/)app\/(login\|auth\|invite\|forgot-password\|reset-password)\/\|logoutAction\|require[A-Za-z]+Session\|middleware\.ts/i |
| 6 | Plan Pipeline | inferred | matched /admin\/plan\|prospect\|planning\|launch-planning\|scenario/i |
| 7 | Auth Flow | inferred | matched /(^\|\/)lib\/auth\/\|(^\|\/)app\/(login\|auth\|invite\|forgot-password\|reset-password)\/\|logoutAction\|require[A-Za-z]+Session\|middleware\.ts/i |
| 8 | Admin Action Runner | inferred | top files matched /lib\/admin\/run-action\|lib\/shared\/run-action\|lib\/admin\/action-result\|lib\/shared\/action-result\|runAction/i |
| 9 | Auth Flow | inferred | matched /(^\|\/)lib\/auth\/\|(^\|\/)app\/(login\|auth\|invite\|forgot-password\|reset-password)\/\|logoutAction\|require[A-Za-z]+Session\|middleware\.ts/i |
| 10 | Admin Validation | inferred | top files matched /lib\/admin\/validation\//i |
| 11 | Shared UI Primitives | inferred | top files matched /components\/ui\|segmented-tabs\|button\|badge\|dialog\|shell\|card/i |
| 12 | Admin RPC Layer | inferred | top files matched /lib\/admin\/rpc\.ts\|lib\/shared\/rpc\.ts\|rpc\(\)\|safeRpc/i |
| 13 | Auth Flow | inferred | top files matched /(^\|\/)lib\/auth\/\|(^\|\/)app\/(login\|auth\|invite\|forgot-password\|reset-password)\/\|logoutAction\|require[A-Za-z]+Session\|middleware\.ts/i |
| 14 | Supabase Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 15 | Supabase Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 16 | Supabase Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 17 | Supabase Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |
| 18 | Supabase Data Access | inferred | top files matched /lib\/supabase\|supabase.*reads\|read-model\|read-batch/i |

## Top Files Per Community
### Supabase Data Access (0)
- lib/supabase/read-models.ts (48)

### Admin Form Components (1)
- components/admin/forms/invite-workflow-form.tsx (11)
- components/admin/forms/field-styles.ts (10)
- components/admin/forms/action-form.tsx (5)
- components/lg/Icon.tsx (4)
- components/admin/forms/change-leader-role-form.tsx (3)
- components/admin/forms/role-change-form.tsx (3)

### Supabase Data Access (2)
- app/reset-password/page.tsx (6)
- app/forgot-password/actions.ts (5)
- app/reset-password/actions.ts (3)
- lib/account/own-name.ts (3)
- lib/account/validation.ts (3)
- app/(protected)/actions.ts (2)

### Admin RPC Layer (3)
- components/pastoral/atoms.tsx (8)
- app/invite/[token]/page.tsx (7)
- components/ui/badge.tsx (6)
- lib/pastoral.ts (3)
- app/forgot-password/page.tsx (2)
- components/auth/user-pill.tsx (2)

### Auth Flow (4)
- lib/auth/session.ts (22)
- app/unauthorized/page.tsx (3)
- lib/auth/leader-surface-flag.ts (2)
- lib/auth/name-pending.ts (2)
- lib/auth/roles.ts (1)

### Auth Flow (5)
- lib/auth/roles.ts (22)
- lib/auth/hub-tiles.ts (6)

### Plan Pipeline (6)
- types/enums.ts (27)

### Auth Flow (7)
- lib/observability/logger.ts (6)
- lib/observability/identifiers.ts (4)
- app/login/actions.ts (3)
- lib/observability/instrument.ts (3)
- app/login/login-form.tsx (2)
- app/login/next-path.ts (2)

### Admin Action Runner (8)
- lib/admin/private-notes-session.ts (9)
- lib/crypto/encoding.ts (6)
- lib/shared/action-result.ts (6)

### Auth Flow (9)
- lib/security/rate-limit.ts (10)
- app/invite/[token]/actions.ts (7)
- app/invite/[token]/invite-signup-form.tsx (2)

### Admin Validation (10)
- lib/admin/validation/shared.ts (12)
- lib/admin/validation/invite-link.ts (5)
- lib/admin/validation/index.ts (1)
- lib/shared/uuid.ts (1)

### Shared UI Primitives (11)
- components/ui/button.tsx (11)
- components/pastoral/button.tsx (6)

### Admin RPC Layer (12)
- lib/shared/rpc.ts (6)
- lib/usage/rpc.ts (3)
- lib/shared/uuid.ts (2)
- lib/account/rpc.ts (1)

### Auth Flow (13)
- app/auth/confirm/route.ts (6)
- app/auth/confirm/safe-next.ts (4)

### Supabase Data Access (14)
- middleware.ts (3)
- lib/supabase/middleware.ts (2)

## Label And Edge Controls
- Raw graph node labels are hidden by default except hubs.
- Use Show Labels, Hub Labels, Selected Community, Neighbor Labels, and Zoom Labels in graph.html.
- Edge labels are hidden by default. Select an edge or enable Edge Labels to inspect relationship types.
