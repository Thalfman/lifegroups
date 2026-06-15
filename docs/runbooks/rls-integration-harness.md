# RLS / action-pipeline integration harness

The harness under `tests/integration/**` exercises the security boundary the
unit suite cannot: **real Row Level Security** as each oversight tier and the
**full SECURITY DEFINER write pipeline** (Auth-issued JWTs that `auth.uid()` /
`auth_is_admin()` / `auth_over_shepherd_covers()` depend on). It is the answer
to issue #607.

It is **opt-in / scheduled** — deliberately **off** the deterministic default
CI lane. `npm run test:run` excludes `tests/integration/**` (see
`vitest.config.ts`), so the default lane stays green with no stack or
credentials.

## What it asserts

- **(a) Per-tier visibility across the ladder** — Super Admin ▸ Ministry Admin ▸
  Over-Shepherd ▸ Leader — including the **two visibility exceptions**:
  1. The Ministry Admin's **Private Care Note** (SC.4, encrypted): readable only
     by its creator, **hidden even from the Super Admin** (the one deliberate
     inversion of the ladder).
  2. **Author-private Care Notes**: sealed to the author until the Ministry
     Admin flips that subject's **transparency toggle**, after which the Super
     Admin reads them too — the ladder peeks on the **same** grant, with no
     super-admin bypass. Flipping the grant back off re-seals them.
- **(b) The action pipeline** — `admin_write_care_note` (a narrow SECURITY
  DEFINER RPC) **persists its row AND a paired `audit_events` row in the same
  transaction**. A raised RPC rolls BOTH back (proving atomicity), the audit
  metadata is presence-only (`has_body`, never the body), and a non-admin
  without coverage is refused.

## Running it locally

Requires the [Supabase CLI](https://supabase.com/docs/guides/local-development).

```bash
supabase start                       # bring up the local Postgres + Auth stack

# Point the harness at the local stack. The CLI prints these on `supabase start`
# (or `supabase status`). The service-role key is HARNESS-ONLY — used to
# provision fixtures, never imported into any Next runtime path.
export RUN_RLS_INTEGRATION=true
export NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321"
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="<local anon key>"
export SUPABASE_SERVICE_ROLE_KEY="<local service-role key>"

npm run test:integration
```

When `RUN_RLS_INTEGRATION` is unset, or the URL/keys are missing, or the URL is
non-local, the specs **skip cleanly** with a logged reason — they never fail a
credential-free checkout.

## In CI

`.github/workflows/rls-integration.yml` runs the harness weekly (and on manual
`workflow_dispatch`). It starts the local stack, exports the CLI-generated local
keys, and runs `npm run test:integration`. No production secrets are involved.

This is distinct from the seeded-auth **route-smoke** workflow (issue #597),
which owns its own separate workflow file; the two harnesses do not share a
workflow.

## Fixtures

`tests/integration/support/fixtures.ts` provisions one Auth user per tier (run-id
namespaced so they never collide with `seed:test-auth` users), bridges the
Over-Shepherd profile to an `over_shepherds` roster row by email, covers the
subject Leader via `shepherd_coverage_assignments`, and anchors a
`shepherd_care_profiles` row for the SC.4 private note. `teardown()` removes the
whole run's disposable local scaffolding afterward. No schema, RLS, migration,
or committed-seed changes — the harness only **tests** the existing boundary.
