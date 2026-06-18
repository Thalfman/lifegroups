---
type: App Module
title: App Structure & Ownership Boundaries
description: The main directories, framework conventions, and where to look before changing anything.
resource: repo://
tags: [structure, conventions, directories, nextjs]
timestamp: 2026-06-18T00:00:00Z
---

# Purpose

Tells a future agent where code lives and which file-name conventions signal
responsibility, so changes land in the right layer and mirror existing patterns.

# Source of truth

- `CLAUDE.md` (Repo map + Code conventions)
- `app/`, `lib/`, `components/`, `types/`, `supabase/`, `tests/`, `docs/`

# Key details

## Top-level directories

- **`app/`** — Next.js App Router. `app/(protected)/` holds role-gated routes:
  `admin/` (Care · Plan · Multiply · Settings · super-admin), `over-shepherd/`,
  `leader/`. Public routes (login, forgot/reset-password, invite, unauthorized,
  support, privacy) sit at the top level. `welcome` also sits at the top level
  but is **not** public — it's a signed-in choose-your-name fallback gate
  (`auth.getUser()`, redirects anon → `/login`). `proxy.ts` is at repo root, not
  in `app/`.
- **`components/`** — `lg/` (app shell, page headers, shared primitives),
  `admin/` (feature UI: care, plan, multiply, …), `ui/` (low-level primitives),
  `auth/` (auth-flow UI).
- **`lib/`** — `auth/` (session, roles, leader-surface flag), `supabase/`
  (server client, reads seam, read models), `admin/` + `leader/` +
  `over-shepherd/` (validators, typed RPC wrappers, run-action adapters,
  domain logic like `cell.ts`/`cell-health.ts`/`health-rubric.ts`), `shared/`
  (action results, run-action core, rpc base, uuid, dates), `observability/`
  (structured logging, read-timing), `nav/`, `home/`, `dashboard/`,
  `security/` (rate-limit).
- **`types/`** — hand-rolled Supabase row types (`database.ts`) + enums
  (`enums.ts`). This is the **trust boundary** — runtime validators check
  against these.
- **`supabase/`** — `migrations/` (schema + RLS + RPCs, timestamp-ordered),
  `seed/`, `functions/` (Edge Functions), `dev/` (auth bootstrap), `config.toml`.
- **`tests/`** — `a11y/` (Playwright + axe), `fitness/` (machine-checked
  invariants), `integration/` (RLS + action-pipeline), `stubs/`.
- **`docs/`** — `adr/` (decisions 0001→0027), `architecture/`, `runbooks/`,
  `agents/`, `julian-inputs/`.

## File-name conventions (signal responsibility)

- `*-shell.tsx` — stateful `"use client"` container
- `*-data.ts` — read orchestration / reads-seam binding
- `*-reads.ts` — RLS reads with column allowlists
- `*-validation.ts` — pure validators returning a result
- `*-rpc.ts` / `rpc.ts` — typed RPC wrappers
- `actions.ts` / `*-actions.ts` — server actions

## Conventions

- TypeScript strict; import via `@/*` alias (no deep relative paths).
- Prettier: 2-space, 80 cols, double quotes, semicolons, es5 trailing commas.
- Thin async pages + stateful shells; discriminated unions for outcomes
  (switch on `kind`); validate→guard→RPC pipeline; structured logging.

# Relationships

- [/okf/architecture/system-overview.md](/okf/architecture/system-overview.md)
- [/okf/architecture/request-lifecycle.md](/okf/architecture/request-lifecycle.md)
- [/okf/routes/index.md](/okf/routes/index.md)
- [/okf/workflows/local-development.md](/okf/workflows/local-development.md)

# Gotchas

- Read `CLAUDE.md` + `CONTEXT.md` before touching domain code — vocabulary is
  enforced (use "Leader" not "Shepherd", "Prospect" not "Guest", etc.).
- `proxy.ts` at repo root is the renamed Next middleware — not in `app/`.
- Pre-pivot surfaces still exist in `app/` (guests, planning, calendar,
  check-ins) — hidden, not deleted. Don't assume an `/admin/*` dir is dead.

# Citations

- `CLAUDE.md` (Repo map, Code conventions, File-name conventions)
