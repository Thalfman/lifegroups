# Seeded-auth route smoke — opt-in / scheduled

A role-route regression (a wrong gate that lets the wrong tier through, or turns
the right tier away) is invisible to the default CI lane: the Vitest suite runs
against the in-memory reads seam, and the a11y suite boots only the
demo-data `/a11y-harness` route. Neither signs in. This runbook covers the
**opt-in** workflow that closes that gap by signing in as seeded users against a
**local** Supabase and smoking the authenticated routes.

It is deliberately **off the default PR lane** (`.github/workflows/ci.yml` stays
deterministic and needs no Supabase). It uses **no production secrets**: a local
Supabase CLI stack mints its own dev keys and the test users are throwaway.

## What it covers

- **Ministry Admin** lands on `/admin` and loads Care / Plan / Multiply.
- **Ministry Admin** is turned away from the Super Admin console.
- **Leader** lands on their own `/leader` care surface and **cannot** reach the
  admin surfaces (the downward-visibility ladder boundary).
- **Anonymous** visits to protected routes redirect to `/login`.
- **Mobile** viewports (the `mobile-smoke` spec) load the same surfaces.

The specs are `tests/a11y/role-routing.spec.ts`, `tests/a11y/leader-routes.spec.ts`,
and `tests/a11y/mobile-smoke.spec.ts`. Each **skips cleanly** when the
`A11Y_*` creds are absent, so they never destabilise `npm run test:a11y`.

## Run it in CI

GitHub → Actions → **Seeded-auth route smoke** → **Run workflow**. It also runs
on a weekly cron (Mondays 07:00 UTC) as a drift check — never as a merge gate.

## Run it locally

```bash
supabase start                       # applies migrations to a local stack
./scripts/seeded-auth-route-smoke.sh # seeds users + runs the smoke
supabase stop --no-backup            # tear down when done
```

The runner reads the local stack's URL + keys from `supabase status`, applies
`supabase/seed/phase2_seed.sql`, seeds throwaway Auth users via the existing
`npm run seed:test-auth` tooling, then builds + serves the app (harness enabled)
and runs the seeded-auth specs. It **refuses** to run against a non-local
Supabase URL.

## What it deliberately does NOT do

- No schema / RLS / policy / seed changes — it only **exercises** the current
  gates with the existing local test-auth tooling.
- No shared staging infra and no production secrets in CI (a staging target
  stays a documented future option).
- The full per-tier RLS + action-pipeline integration harness is a **separate**
  effort (#607, `tests/integration/**`) with its own workflow file; this smoke
  is additive alongside it.
