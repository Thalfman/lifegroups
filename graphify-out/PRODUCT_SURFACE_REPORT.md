# Product Surface Graph Report

Generated: 2026-06-12T19:28:58.652Z

## Summary
- Scope: product
- Staged files: 489
- Raw extraction: 3400 symbol nodes, 7775 symbol edges, 486 source files
- Clean graph: 181 nodes, 1171 edges
- Preserved file nodes: 122
- Grouped lower-degree files: 364 files into 59 module buckets
- Output: graphify-out

## Exclusion Audit
- OK: tests: 0
- OK: generated DB types: 0
- OK: app/a11y-harness: 0
- OK: docs: 0
- OK: Graphify output/tooling: 0
- OK: package/lock metadata: 0

## Excluded Candidate Files
- tests: 252
- data-boundary-only generated types: 1

## Category Counts
- Domain Module: 45
- Feature Component: 37
- Route/Page/Layout: 19
- Supabase Read Adapter: 17
- Validation: 17
- Server Action: 13
- Shared UI Primitive: 13
- RPC/Write Boundary: 7
- Shared Plumbing: 6
- Auth/Session Boundary: 4
- Observability/Security: 2
- Type/Vocabulary: 1

## Product Area Counts
- Core: 43
- Care: 21
- Groups: 17
- Calendar: 16
- Multiply: 15
- Home: 14
- Plan: 14
- Settings: 12
- Shared: 12
- People: 10
- Auth: 7

## Product Hubs
- Core Feature Component (262.5) - Feature Component, Core
- Core Domain Module (213.1) - Domain Module, Core
- Care Feature Component (200.75) - Feature Component, Care
- Admin Forms Action Form (158.05) - Feature Component, Core
- Core Server Action (140.95) - Server Action, Core
- Admin Validation Shared (130.05) - Validation, Core
- Plan Feature Component (113.55) - Feature Component, Plan
- Admin Metrics (108) - Domain Module, Core
- People Feature Component (106.35) - Feature Component, People
- Care Domain Module (92) - Domain Module, Care
- Admin Super Admin Console (84) - Feature Component, Core
- Calendar Occurrences (79.45) - Domain Module, Calendar
- Dashboard Queries (79.45) - Domain Module, Home
- Admin Launch Planning (78) - Domain Module, Plan
- Admin Groups Group Detail Data (74) - Feature Component, Groups
- Admin Check Ins (73.1) - Domain Module, Calendar
- Dashboard Types (71.4) - Domain Module, Home
- Home Domain Module (69.45) - Domain Module, Home

## Boundary Hubs
- Supabase Read Models (208.45) - Supabase Read Adapter, Core
- Admin Run Action (155) - RPC/Write Boundary, Core
- Core Server Action (140.95) - Server Action, Core
- Supabase Server (133) - Supabase Read Adapter, Core
- Auth Session (131) - Auth/Session Boundary, Auth
- Auth Auth/Session Boundary (90.5) - Auth/Session Boundary, Auth
- Supabase Read Core (82) - Supabase Read Adapter, Core
- Admin Rpc (71.25) - RPC/Write Boundary, Core
- Supabase Reads Seam (56) - Supabase Read Adapter, Core
- Care Server Action (52) - Server Action, Care
- Plan Server Action (52) - Server Action, Plan
- Auth Roles (47.45) - Auth/Session Boundary, Auth
- Groups Server Action (42) - Server Action, Groups
- Supabase Maintenance Reads (38) - Supabase Read Adapter, Core
- Calendar Server Action (36) - Server Action, Calendar
- Admin Shepherd Care Actions (35) - Server Action, Care
- Admin Super Admin Permanent Delete Actions (33.8) - Server Action, Core
- Supabase Group Categories Reads (33) - Supabase Read Adapter, Settings

## Softened Shared Hubs
- Enums Types (100.05) - Type/Vocabulary, Shared
- Utils (45.05) - Shared Plumbing, Shared
- Home Shared UI Primitive (39.25) - Shared UI Primitive, Home
- Pastoral Button (35.85) - Shared UI Primitive, Shared
- Shared Shared UI Primitive (34.95) - Shared UI Primitive, Shared
- Shared Uuid (27.4) - Shared Plumbing, Shared
- Shared Validation Primitives (27.05) - Shared Plumbing, Shared
- Ui Button (24.5) - Shared UI Primitive, Shared
- Lg Page Header (22.7) - Shared UI Primitive, Shared
- Shared Church Time (22.25) - Shared Plumbing, Calendar
- Shared Action Result (21.15) - Shared Plumbing, Shared
- Ui Badge (19.65) - Shared UI Primitive, Shared
- Shared Shared Plumbing (18.25) - Shared Plumbing, Shared
- Admin Dashboard Dashboard Client (14.45) - Shared UI Primitive, Home
- Pastoral Atoms (14.15) - Shared UI Primitive, Shared
- Admin Dashboard Overview Primitives (12.2) - Shared UI Primitive, Home
- Auth Shared UI Primitive (10.05) - Shared UI Primitive, Auth
- Groups Shared UI Primitive (10) - Shared UI Primitive, Groups

## Cross-Feature Coupling
- Care <-> Core: 318 symbol links
  - Care Domain Module -> Core Domain Module (2)
  - Care Domain Module -> Admin Attention Reset (1)
  - Care Domain Module -> Supabase Read Core (3)
  - Care Feature Component -> Core Domain Module (11)
  - Care Feature Component -> Core Feature Component (3)
- Core <-> Groups: 206 symbol links
  - Core Domain Module -> Groups Supabase Read Adapter (3)
  - Core Domain Module -> Admin Group Health Override (4)
  - Core Domain Module -> Admin Health Rubric (7)
  - Core Feature Component -> Groups Server Action (4)
  - Core Validation -> Admin Group Health Override (2)
- Core <-> People: 173 symbol links
  - Core Feature Component -> People Feature Component (6)
  - Core Feature Component -> Admin People Actions (2)
  - People Auth/Session Boundary -> Core Observability/Security (2)
  - People Auth/Session Boundary -> Observability Instrument (2)
  - People Auth/Session Boundary -> Shared Rpc (2)
- Core <-> Plan: 168 symbol links
  - Core Feature Component -> Admin Leader Pipeline Leader Pipeline Data (1)
  - Core Feature Component -> Admin Leader Pipeline (1)
  - Plan Domain Module -> Admin Metrics (1)
  - Plan Domain Module -> Admin Validation Shared (1)
  - Plan Feature Component -> Admin Forms Action Form (14)
- Auth <-> Core: 147 symbol links
  - Auth Auth/Session Boundary -> Core Domain Module (10)
  - Auth Auth/Session Boundary -> Core Observability/Security (13)
  - Auth Auth/Session Boundary -> Core RPC/Write Boundary (6)
  - Auth Auth/Session Boundary -> Core Server Action (1)
  - Auth Auth/Session Boundary -> Admin Super Admin Console (1)
- Core <-> Settings: 130 symbol links
  - Core Domain Module -> Settings Domain Module (3)
  - Core Domain Module -> Admin Feature Flags (7)
  - Core Feature Component -> Admin Settings Actions (4)
  - Core Feature Component -> Admin Feature Flags (6)
  - Core Server Action -> Admin Feature Flags (2)
- Core <-> Home: 106 symbol links
  - Core Route/Page/Layout -> Home Domain Module (2)
  - Home Domain Module -> Core Domain Module (3)
  - Home Domain Module -> Supabase Read Core (3)
  - Home Domain Module -> Supabase Read Models (9)
  - Home Domain Module -> Supabase Server (3)
- Calendar <-> Core: 101 symbol links
  - Calendar Feature Component -> Core Feature Component (1)
  - Calendar Route/Page/Layout -> Core Feature Component (2)
  - Calendar Route/Page/Layout -> Admin Planning Views (1)
  - Calendar Route/Page/Layout -> Supabase Server (4)
  - Calendar Server Action -> Core RPC/Write Boundary (1)
- Groups <-> Home: 62 symbol links
  - Home Domain Module -> Admin Group Health (1)
  - Admin Groups Page -> Dashboard Labels (12)
  - Admin Groups Directory -> Home Domain Module (15)
  - Admin Groups Directory -> Dashboard Group Status (8)
  - Admin Groups Directory -> Dashboard Labels (9)
- Core <-> Multiply: 58 symbol links
  - Multiply Feature Component -> Core Domain Module (1)
  - Multiply Feature Component -> Admin Audience (1)
  - Multiply Feature Component -> Supabase Read Batch (1)
  - Multiply Feature Component -> Supabase Read Models (3)
  - Multiply Feature Component -> Supabase Reads Seam (3)
- Auth <-> Care: 30 symbol links
  - Care Feature Component -> Admin Private Notes Session (2)
  - Care Route/Page/Layout -> Auth Roles (6)
  - Care Route/Page/Layout -> Auth Session (10)
  - Care Server Action -> Auth Session (4)
  - Admin Care Page -> Auth Roles (2)
- Care <-> Home: 24 symbol links
  - Care Domain Module -> Dashboard Types (2)
  - Care Feature Component -> Dashboard Labels (5)
  - Home Domain Module -> Admin Validation Follow Ups (1)
  - Admin Follow Ups Follow Ups Shell -> Dashboard Labels (4)
  - Dashboard Demo Seed -> Care Domain Module (2)

## Grouped Module Buckets
- Core Feature Component: 44 files, 124 symbols, degree 262.5
- Care Feature Component: 37 files, 107 symbols, degree 200.75
- Core Domain Module: 34 files, 189 symbols, degree 213.1
- Auth Auth/Session Boundary: 20 files, 61 symbols, degree 90.5
- Plan Feature Component: 19 files, 90 symbols, degree 113.55
- Shared Shared UI Primitive: 18 files, 41 symbols, degree 34.95
- People Feature Component: 16 files, 73 symbols, degree 106.35
- Core Server Action: 15 files, 75 symbols, degree 140.95
- Home Shared UI Primitive: 14 files, 43 symbols, degree 39.25
- Care Domain Module: 10 files, 79 symbols, degree 92
- Home Domain Module: 8 files, 59 symbols, degree 69.45
- Care Route/Page/Layout: 7 files, 19 symbols, degree 57.1
- Calendar Feature Component: 7 files, 32 symbols, degree 49.8
- Care Server Action: 6 files, 41 symbols, degree 52
- Groups Feature Component: 6 files, 21 symbols, degree 48.75
- Shared Shared Plumbing: 6 files, 14 symbols, degree 18.25
- Core Observability/Security: 5 files, 56 symbols, degree 50
- Plan Server Action: 4 files, 57 symbols, degree 52
- Plan Domain Module: 4 files, 36 symbols, degree 45
- Calendar Route/Page/Layout: 4 files, 15 symbols, degree 36.4
- Multiply Feature Component: 4 files, 19 symbols, degree 33
- Core Validation: 4 files, 40 symbols, degree 29.25
- Core Supabase Read Adapter: 4 files, 18 symbols, degree 28
- Plan Route/Page/Layout: 4 files, 11 symbols, degree 22.8
