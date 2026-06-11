# Product Surface Graph Report

Generated: 2026-06-11T22:39:43.313Z

## Summary
- Scope: product
- Staged files: 480
- Raw extraction: 3409 symbol nodes, 7871 symbol edges, 477 source files
- Clean graph: 180 nodes, 1148 edges
- Preserved file nodes: 122
- Grouped lower-degree files: 355 files into 58 module buckets
- Output: graphify-out

## Exclusion Audit
- OK: tests: 0
- OK: generated DB types: 0
- OK: app/a11y-harness: 0
- OK: docs: 0
- OK: Graphify output/tooling: 0
- OK: package/lock metadata: 0

## Excluded Candidate Files
- tests: 237
- data-boundary-only generated types: 1

## Category Counts
- Domain Module: 43
- Feature Component: 35
- Route/Page/Layout: 19
- Supabase Read Adapter: 17
- Server Action: 16
- Validation: 16
- Shared UI Primitive: 13
- RPC/Write Boundary: 8
- Shared Plumbing: 6
- Auth/Session Boundary: 4
- Observability/Security: 2
- Type/Vocabulary: 1

## Product Area Counts
- Core: 43
- Care: 20
- Groups: 18
- Calendar: 16
- Multiply: 15
- Home: 14
- Plan: 14
- Settings: 12
- Shared: 12
- People: 10
- Auth: 6

## Product Hubs
- Core Feature Component (261.85) - Feature Component, Core
- Care Feature Component (200.75) - Feature Component, Care
- Core Domain Module (194.1) - Domain Module, Core
- Admin Forms Action Form (158.05) - Feature Component, Core
- Core Server Action (143.95) - Server Action, Core
- Admin Validation Shared (130.05) - Validation, Core
- Plan Feature Component (129.3) - Feature Component, Plan
- People Feature Component (107.35) - Feature Component, People
- Admin Metrics (107) - Domain Module, Core
- Admin Super Admin Console (83) - Feature Component, Core
- Dashboard Queries (80.45) - Domain Module, Home
- Admin Launch Planning (78) - Domain Module, Plan
- Calendar Occurrences (77.45) - Domain Module, Calendar
- Admin Groups Group Detail Data (75) - Feature Component, Groups
- Admin Check Ins (73.1) - Domain Module, Calendar
- Home Domain Module (69.45) - Domain Module, Home
- Dashboard Types (68.4) - Domain Module, Home
- Dashboard Labels (66.8) - Domain Module, Home

## Boundary Hubs
- Admin Rpc (243.25) - RPC/Write Boundary, Core
- Supabase Read Models (208.45) - Supabase Read Adapter, Core
- Admin Run Action (155) - RPC/Write Boundary, Core
- Core Server Action (143.95) - Server Action, Core
- Supabase Server (133) - Supabase Read Adapter, Core
- Auth Session (132) - Auth/Session Boundary, Auth
- Shared Rpc (123) - RPC/Write Boundary, Core
- Auth Auth/Session Boundary (91.5) - Auth/Session Boundary, Auth
- Supabase Read Core (81) - Supabase Read Adapter, Core
- Care Server Action (56) - Server Action, Care
- Supabase Reads Seam (56) - Supabase Read Adapter, Core
- Admin Shepherd Care Actions (50) - Server Action, Care
- Auth Roles (47.45) - Auth/Session Boundary, Auth
- Plan Server Action (45) - Server Action, Plan
- Admin Settings Actions (38) - Server Action, Settings
- Supabase Maintenance Reads (38) - Supabase Read Adapter, Core
- Admin Super Admin Permanent Delete Actions (34.8) - Server Action, Core
- Supabase Group Categories Reads (33) - Supabase Read Adapter, Settings

## Softened Shared Hubs
- Enums Types (99.05) - Type/Vocabulary, Shared
- Utils (44.1) - Shared Plumbing, Shared
- Home Shared UI Primitive (38.25) - Shared UI Primitive, Home
- Pastoral Button (35.2) - Shared UI Primitive, Shared
- Shared Shared UI Primitive (33.3) - Shared UI Primitive, Shared
- Shared Uuid (27.4) - Shared Plumbing, Shared
- Shared Validation Primitives (27.05) - Shared Plumbing, Shared
- Ui Button (25.5) - Shared UI Primitive, Shared
- Lg Page Header (22.7) - Shared UI Primitive, Shared
- Shared Church Time (21.25) - Shared Plumbing, Calendar
- Shared Action Result (21.15) - Shared Plumbing, Shared
- Ui Badge (19.65) - Shared UI Primitive, Shared
- Shared Shared Plumbing (18.25) - Shared Plumbing, Shared
- Admin Dashboard Dashboard Client (14.45) - Shared UI Primitive, Home
- Pastoral Atoms (14.15) - Shared UI Primitive, Shared
- Admin Dashboard Overview Primitives (12.2) - Shared UI Primitive, Home
- Auth Shared UI Primitive (10.05) - Shared UI Primitive, Auth
- Groups Shared UI Primitive (10) - Shared UI Primitive, Groups

## Cross-Feature Coupling
- Care <-> Core: 334 symbol links
  - Care Domain Module -> Core Domain Module (2)
  - Care Domain Module -> Supabase Read Core (2)
  - Care Feature Component -> Core Domain Module (11)
  - Care Feature Component -> Core Feature Component (3)
  - Care Feature Component -> Core Observability/Security (1)
- Core <-> Groups: 214 symbol links
  - Core Domain Module -> Groups Supabase Read Adapter (3)
  - Core Domain Module -> Admin Group Health Override (4)
  - Core Domain Module -> Admin Health Rubric (7)
  - Core Feature Component -> Groups Server Action (4)
  - Core Validation -> Groups Validation (2)
- Core <-> Plan: 182 symbol links
  - Core Feature Component -> Admin Leader Pipeline Leader Pipeline Data (1)
  - Core Feature Component -> Admin Leader Pipeline (1)
  - Core Validation -> Plan Validation (1)
  - Core Validation -> Admin Validation Launch Planning (1)
  - Core Validation -> Admin Validation Prospects (1)
- Core <-> People: 181 symbol links
  - Core Feature Component -> People Feature Component (6)
  - Core Feature Component -> Admin People Actions (1)
  - Core Validation -> People Validation (2)
  - People Auth/Session Boundary -> Core Observability/Security (2)
  - People Auth/Session Boundary -> Observability Instrument (2)
- Auth <-> Core: 147 symbol links
  - Auth Auth/Session Boundary -> Core Domain Module (10)
  - Auth Auth/Session Boundary -> Core Observability/Security (13)
  - Auth Auth/Session Boundary -> Core RPC/Write Boundary (6)
  - Auth Auth/Session Boundary -> Core Server Action (1)
  - Auth Auth/Session Boundary -> Admin Super Admin Console (1)
- Core <-> Settings: 130 symbol links
  - Core Domain Module -> Settings Domain Module (3)
  - Core Domain Module -> Admin Feature Flags (3)
  - Core Feature Component -> Admin Settings Actions (3)
  - Core Feature Component -> Admin Feature Flags (6)
  - Core Server Action -> Admin Feature Flags (2)
- Calendar <-> Core: 106 symbol links
  - Calendar Feature Component -> Core Feature Component (1)
  - Calendar Route/Page/Layout -> Core Feature Component (2)
  - Calendar Route/Page/Layout -> Admin Planning Views (1)
  - Calendar Route/Page/Layout -> Supabase Server (4)
  - Core Feature Component -> Admin Check Ins (1)
- Core <-> Home: 104 symbol links
  - Core Route/Page/Layout -> Home Domain Module (2)
  - Home Domain Module -> Core Domain Module (3)
  - Home Domain Module -> Supabase Read Core (3)
  - Home Domain Module -> Supabase Read Models (9)
  - Home Domain Module -> Supabase Server (3)
- Groups <-> Home: 62 symbol links
  - Home Domain Module -> Admin Group Health (1)
  - Admin Groups Page -> Dashboard Labels (12)
  - Admin Groups Directory -> Home Domain Module (15)
  - Admin Groups Directory -> Dashboard Group Status (8)
  - Admin Groups Directory -> Dashboard Labels (9)
- Core <-> Multiply: 58 symbol links
  - Core Validation -> Multiply Validation (1)
  - Core Validation -> Admin Validation Readiness Rule (1)
  - Multiply Feature Component -> Core Domain Module (1)
  - Multiply Feature Component -> Admin Audience (1)
  - Multiply Feature Component -> Supabase Read Batch (1)
- Auth <-> Care: 30 symbol links
  - Care Feature Component -> Auth Domain Module (2)
  - Care Route/Page/Layout -> Auth Roles (6)
  - Care Route/Page/Layout -> Auth Session (10)
  - Care Server Action -> Auth Session (4)
  - Admin Care Page -> Auth Roles (2)
- Care <-> Groups: 23 symbol links
  - Care Feature Component -> Groups Server Action (1)
  - Care Feature Component -> Groups Supabase Read Adapter (1)
  - Care Feature Component -> Admin Groups Page (1)
  - Care Feature Component -> Admin Group Health Override (2)
  - Care Feature Component -> Admin Health Rubric (7)

## Grouped Module Buckets
- Core Feature Component: 44 files, 123 symbols, degree 261.85
- Care Feature Component: 37 files, 107 symbols, degree 200.75
- Core Domain Module: 30 files, 165 symbols, degree 194.1
- Plan Feature Component: 20 files, 96 symbols, degree 129.3
- Auth Auth/Session Boundary: 20 files, 61 symbols, degree 91.5
- Shared Shared UI Primitive: 18 files, 40 symbols, degree 33.3
- People Feature Component: 16 files, 73 symbols, degree 107.35
- Core Server Action: 15 files, 75 symbols, degree 143.95
- Home Shared UI Primitive: 14 files, 43 symbols, degree 38.25
- Home Domain Module: 8 files, 59 symbols, degree 69.45
- Care Domain Module: 8 files, 57 symbols, degree 66
- Care Route/Page/Layout: 7 files, 19 symbols, degree 56.1
- Calendar Feature Component: 7 files, 32 symbols, degree 48.8
- Care Server Action: 6 files, 41 symbols, degree 56
- Groups Feature Component: 6 files, 21 symbols, degree 48.75
- Shared Shared Plumbing: 6 files, 14 symbols, degree 18.25
- Core Observability/Security: 5 files, 56 symbols, degree 50
- Core Validation: 5 files, 41 symbols, degree 43.25
- Plan Domain Module: 4 files, 36 symbols, degree 45
- Calendar Route/Page/Layout: 4 files, 15 symbols, degree 36.4
- Multiply Feature Component: 4 files, 19 symbols, degree 33
- Core Supabase Read Adapter: 4 files, 18 symbols, degree 28
- Plan Route/Page/Layout: 4 files, 11 symbols, degree 22.8
- Groups Domain Module: 4 files, 21 symbols, degree 17
