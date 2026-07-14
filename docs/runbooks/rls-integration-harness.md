# RLS / action-pipeline integration harness

The harness under `tests/integration/**` exercises the security boundary the
unit suite cannot: **real Row Level Security** as each oversight tier and the
**full SECURITY DEFINER write pipeline** (Auth-issued JWTs that `auth.uid()` /
`auth_is_admin()` / `auth_over_shepherd_covers()` depend on). It is the answer
to issue #607.

The deterministic unit runner still excludes `tests/integration/**` (see
`vitest.config.ts`), so `npm run test:run` needs no stack or credentials. The
required CI workflow separately starts a local Supabase stack and runs this
harness whenever RLS-relevant files change; the standalone workflow provides a
weekly and manual backstop.

## What it asserts

- **(a) Per-tier visibility across the ladder** — Super Admin ▸ Ministry Admin ▸
  Over-Shepherd ▸ Leader ▸ Co-Leader — including the **two visibility exceptions**:
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
- **(c) Priority table boundaries** — Super-Admin-only deletion, invitation,
  tombstone, and clean-slate/history/attention snapshot rows are visible to the
  Super Admin and hidden from every lower tier. Leader-scoped `groups` and
  `members` rows are visible to the assigned Leader and both admin tiers, but
  hidden from unrelated Leaders, Co-Leaders, and Over-Shepherds.
- **(d) Coverage cannot silently shrink** — the static manifest accounts for
  every RLS-enabled table and caps explicitly deferred live coverage at 18.
  Adding a protected table without classifying it, or increasing the deferred
  count, fails the fitness suite.

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

The required `.github/workflows/ci.yml` job uses a step-level path gate: it
starts the local stack and runs the harness when migrations, RLS integration
tests/config, Supabase config, or dependency manifests change, while still
reporting the same CI job on unrelated pull requests. The standalone
`.github/workflows/rls-integration.yml` workflow runs the same harness weekly
and on manual `workflow_dispatch`. Both export CLI-generated local keys; no
production secrets are involved.

This is distinct from the seeded-auth **route-smoke** workflow (issue #597),
which owns its own separate workflow file; the two harnesses do not share a
workflow.

## Fixtures

`tests/integration/support/fixtures.ts` provisions Auth users for every tier,
including a Co-Leader, plus assigned and unrelated Leader controls. Run-id
namespacing prevents collisions with `seed:test-auth` users. The fixture bridges
the Over-Shepherd profile to an `over_shepherds` roster row by email and covers
the subject Leader through `shepherd_coverage_assignments`. It also anchors a
`shepherd_care_profiles` row for the SC.4 private note.

`tests/integration/support/priority-rls-fixtures.ts` adds disposable assigned and
unrelated groups/members plus rows in the Super-Admin-only priority tables.
Fixture provisioning uses the local service client only after the harness has
proved the target URL is local; assertions themselves use each tier's real
Auth-issued JWT. Teardown removes the whole run's scaffolding afterward. No
schema, RLS, migration, or committed-seed changes — the harness only **tests**
the existing boundary.

The visibility suite also service-seeds a pending
`profile_auth_purge_jobs` row through the irreversible-profile tombstone
trigger, then proves that every authenticated tier receives a denied read. That
live `NO_READ` assertion covers the service-only retry seam; the fixture is
removed during local teardown.
