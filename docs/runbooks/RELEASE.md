# Release Runbook — code + schema ship together

The one sanctioned path for getting a change into production. It exists
because the two halves of a release are NOT symmetric: Vercel deploys `main`
automatically, but migrations only reach production through a deliberate
apply step. The 2026-06 launch-readiness review found production two
migrations behind `main` (including an RLS fix) precisely because that step
used to be a remembered manual command — this runbook, plus the
**`Production migrations` workflow** (#905,
`.github/workflows/prod-migrations.yml`), is the fix: the workflow is the
default way to apply, and its drift check fails loudly whenever prod and
`main` disagree.

## The rule

> **A PR that adds a migration is not "shipped" when it merges.** It is
> shipped when the migration is applied to the production database and
> verified. Schema first, then code, whenever both change.

Code-only changes need nothing beyond the merge: Vercel builds and promotes
`main` to production automatically (project `lifegroups`, domain
`fvclifegroups.vercel.app`).

## Releasing a change that includes a migration

Schema first, then code — in that order, so production never serves code
against a database that doesn't have the schema it expects:

1. **Get the PR ready to merge** (CI green: lint → typecheck → test:run +
   a11y; review done). Don't apply anything to production from a branch that
   might still change.

2. **Apply the migration(s)** to the production project
   (`juvytverslrcqbkxgkvg`), in file order.

   **Default — the `Production migrations` workflow:** Actions →
   `Production migrations` → Run workflow → pick the **approved PR branch**
   as the ref → check **apply**. The job pauses on the `production`
   environment for approval, runs the same `supabase db push` below, and
   verifies parity afterward — all recorded in the run log.

   **Fallback — the Supabase CLI from the approved branch:**

   ```bash
   supabase link --project-ref juvytverslrcqbkxgkvg
   supabase db push          # applies pending supabase/migrations/* in order
   ```

   `supabase db push` records each file under its **repo version number** in
   `supabase_migrations.schema_migrations` — that bookkeeping is what makes
   the next release's "what's pending?" answerable. Do **not** paste
   migration SQL into the dashboard SQL editor or apply it through ad-hoc
   tooling that stamps its own version: that is exactly how the histories
   diverged before.

   This ordering is safe because this repo's migrations are additive by
   discipline (no drops, archive-only): deployed code simply ignores schema
   it doesn't know about. If a migration ever _removes_ something deployed
   code still reads, that needs a two-phase release (ship code that stops
   reading it first), not a reorder of these steps.

3. **Merge the PR.** Vercel builds and promotes `main` automatically; wait
   for the deploy of the merge commit to show READY.

4. **Verify parity.** The `Production migrations` drift check runs this
   automatically on the merge to `main` (path-gated on
   `supabase/migrations/**`) and weekly, failing the workflow on any
   divergence in either direction. Manual equivalent:

   ```bash
   supabase migration list   # local and remote columns must agree
   ```

   (Equivalent check from SQL: `select version, name from
supabase_migrations.schema_migrations order by version;` against
   `ls supabase/migrations/`.)

5. **Smoke-check** the touched surface signed in as a Ministry Admin, and
   re-run the Supabase advisors (Dashboard → Advisors, or the MCP
   `get_advisors` tool) after any migration that touches RLS, grants, or
   `security definer` functions.

## Automation — the `Production migrations` workflow

`.github/workflows/prod-migrations.yml` (#905) carries both halves of the
schema story:

- **`apply`** (manual dispatch only, `apply` checked): approval-gated on the
  `production` environment, runs `supabase db push` from whichever ref you
  dispatch it on — use the approved PR branch so schema lands before the
  merge deploys code. A push-triggered apply is deliberately not offered: it
  would race the Vercel code deploy and invert the schema-first ordering.
- **`drift-check`** (push to `main` touching `supabase/migrations/**`,
  weekly, or a dispatch without `apply`): `scripts/check-migration-drift.sh`
  compares production's applied history against `supabase/migrations/` and
  fails on drift in either direction (pending locals, or remote-only versions
  like the ones the 2026-06 incident left behind). Scope note: this is a
  **version-history** check — content drift behind matching versions (editing
  an applied migration file, or dashboard SQL that never stamps
  `schema_migrations`) is invisible to it. Both moves are forbidden by this
  runbook; that discipline is the content guard, and a shadow-DB
  `supabase db diff` lane is the escalation if it ever proves insufficient.

**One-time provisioning (the only human setup):** create two environments
(Settings → Environments) and add the three secrets **to each environment**
(not as repo-level secrets — environment secrets are only readable by jobs
that pass that environment's protection rules, which is what makes the ref
model below tamper-proof). The jobs fail with an explicit "missing secret"
error until they exist — they never skip silently.

| Environment        | Protection rules                                        | Used by       |
| ------------------ | ------------------------------------------------------- | ------------- |
| `production`       | **Required reviewer** (every apply pauses for approval) | `apply`       |
| `production-drift` | **Deployment branches: `main` only**, no reviewer       | `drift-check` |

| Secret (on both environments) | Value                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `SUPABASE_ACCESS_TOKEN`       | A personal access token that can manage the prod project (Account → Access Tokens) |
| `SUPABASE_PROJECT_REF`        | `juvytverslrcqbkxgkvg`                                                             |
| `SUPABASE_DB_PASSWORD`        | The production database password (Project Settings → Database)                     |

Why this shape: a dispatched run executes the workflow and scripts **from the
selected ref**, and a branch can edit its own copy of the workflow file — so
the protections must live in repo settings, not in the file. A branch that
strips the `environment:` line simply gets no secrets; one that keeps it
still pauses on the `production` reviewer, and that approval **is the ref
check** — approve only a reviewed branch, and read any diff touching
`.github/workflows/prod-migrations.yml` or `scripts/check-migration-drift.sh`
with extra care. The unattended drift-check can only ever read the secrets
through `production-drift`, whose branch policy admits `main` alone.

## Edge Functions

Edge Functions deploy separately from both halves above:

```bash
supabase functions deploy invite-user
supabase functions deploy redeem-invite
supabase functions deploy purge-profile-auth
```

Production runs **exactly these three**: `invite-user`, `redeem-invite`, and
`purge-profile-auth` (the service-role boundary for permanent profile deletion).
`supabase/config.toml` also declares `manage-test-auth-users`, but that is
local/test tooling — never deploy it to production (the launch runbook has
it removed). Anything else found deployed in production (e.g. a scratch/test
function) should be deleted, not left "just in case".

**Beware the implicit deploy path.** The Supabase GitHub integration's
deploy-to-production step redeploys every Edge Function declared in
`supabase/config.toml` on each push to `main` — it is not limited to the three
named above. This is how `manage-test-auth-users` returned to production on
2026-06-09 minutes after being manually deleted: the push that recorded the
deletion triggered the integration, which redeployed it. The guard is
`enabled = false` on that function's block in `config.toml`; both the blanket
CLI deploy and the integration skip disabled functions. If a new test-only
function is ever added, give it `enabled = false` from the first commit.
After any merge that touches `supabase/functions/` or `config.toml`, verify
the production function list still shows exactly `invite-user`, `redeem-invite`,
and `purge-profile-auth` (Dashboard → Edge Functions, or the MCP `list_edge_functions`
tool).

A committed test enforces this allowlist in CI:
`lib/security/__tests__/edge-functions-allowlist.test.ts` parses
`supabase/config.toml` and fails if `manage-test-auth-users` is ever enabled, or
if the non-disabled set drifts from `invite-user` + `redeem-invite` +
`purge-profile-auth`. Update that test's `PRODUCTION_FUNCTIONS` list deliberately if
the production set is ever meant to change.

## When something goes wrong

- A failed `db push` leaves the failed migration unrecorded — fix the SQL,
  re-push. Never hand-edit `schema_migrations` to "make it pass".
- If a migration applied but the app misbehaves, **roll forward** (new
  migration) rather than deleting rows from history; see
  [`BACKUP_AND_RESTORE.md`](./BACKUP_AND_RESTORE.md) for the recovery
  ladder before any destructive correction.
