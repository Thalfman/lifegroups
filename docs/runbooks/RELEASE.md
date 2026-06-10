# Release Runbook — code + schema ship together

The one sanctioned path for getting a change into production. It exists
because the two halves of a release are NOT symmetric: Vercel deploys `main`
automatically, but **nothing applies database migrations automatically**. The
2026-06 launch-readiness review found production two migrations behind `main`
(including an RLS fix) precisely because of this asymmetry — this runbook is
the fix.

## The rule

> **A PR that adds a migration is not "shipped" when it merges.** It is
> shipped when the migration is applied to the production database and
> verified. Schema first, then code, whenever both change.

Code-only changes need nothing beyond the merge: Vercel builds and promotes
`main` to production automatically (project `lifegroups`, domain
`fvclifegroups.vercel.app`).

## Releasing a change that includes a migration

1. **Merge the PR** (CI green: lint → typecheck → test:run + a11y).
2. **Apply the migration(s)** to the production project
   (`juvytverslrcqbkxgkvg`), in file order, using the Supabase CLI from a
   checkout of `main`:

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

3. **Verify parity.** The applied list must match the repo:

   ```bash
   supabase migration list   # local and remote columns must agree
   ```

   (Equivalent check from SQL: `select version, name from
supabase_migrations.schema_migrations order by version;` against
   `ls supabase/migrations/`.)

4. **Wait for the Vercel deploy of the merge commit** to be READY (it is
   usually done before step 2 — that is fine as long as the app code
   degrades gracefully, which the read/write seams guarantee for additive
   changes; for breaking schema changes, apply the migration **before**
   merging the code that depends on it).

5. **Smoke-check** the touched surface signed in as a Ministry Admin, and
   re-run the Supabase advisors (Dashboard → Advisors, or the MCP
   `get_advisors` tool) after any migration that touches RLS, grants, or
   `security definer` functions.

## Edge Functions

Edge Functions deploy separately from both halves above:

```bash
supabase functions deploy invite-user redeem-invite
```

Deploy only the functions in `supabase/config.toml`. Anything else found
deployed in production (e.g. a scratch/test function) should be deleted, not
left "just in case".

## When something goes wrong

- A failed `db push` leaves the failed migration unrecorded — fix the SQL,
  re-push. Never hand-edit `schema_migrations` to "make it pass".
- If a migration applied but the app misbehaves, **roll forward** (new
  migration) rather than deleting rows from history; see
  [`BACKUP_AND_RESTORE.md`](./BACKUP_AND_RESTORE.md) for the recovery
  ladder before any destructive correction.
