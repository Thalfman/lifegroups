# Backup & Restore Runbook

The production database (`Fvclifegroups`, project ref `juvytverslrcqbkxgkvg`)
holds pastoral-care data that exists nowhere else — Care Notes, Prayer
Requests, the shepherd-care history, and the `audit_events` spine. Losing it
is not recoverable from the repo: migrations rebuild the **schema**, never the
**data**.

## What protects us

| Layer                      | What it covers                                                                                              | Where                                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Supabase Pro daily backups | Full-database snapshot, 7-day retention                                                                     | Dashboard → Database → Backups                                                                               |
| In-app snapshots           | Danger-Zone wipes (Clean Slate, history resets) capture a recoverable snapshot + tombstones before deleting | `clean_slate_snapshots`, `history_reset_snapshots`, `tombstones` tables; restore via the Super-Admin console |
| Manual `pg_dump`           | Point-in-time copy you take yourself before risky work                                                      | Your machine (see below)                                                                                     |

The org is on the **Pro plan** — that is a launch requirement, not a
nice-to-have. Free-tier projects have **no** automated backups and pause
after ~1 week of inactivity. If the project ever shows "Free" again, treat it
as a P0.

## Routine

- **Verify, monthly:** Dashboard → Database → Backups shows a backup from the
  last 24 h. A backup setting that silently stopped working is
  indistinguishable from no backups.
- **Before any Danger-Zone operation** (Clean Slate, Reset everything,
  permanent deletion) **and before a migration that rewrites data** (not just
  `create`/`alter ... add`): take a manual logical dump first:

  ```bash
  supabase link --project-ref juvytverslrcqbkxgkvg
  supabase db dump --data-only -f backup-$(date +%Y%m%d).sql
  ```

  Keep it somewhere private (it contains care data) and delete it once the
  operation is verified — these dumps are a safety window, not an archive.

## Restoring

Work down this ladder; stop at the first rung that fits:

1. **A user deleted/archived something in-app** → Archive is soft by design.
   Un-archive from the surface, or for permanent deletions use the
   Super-Admin console's tombstone **Restore** (audited,
   `super_admin_restore_tombstone`).
2. **A Danger-Zone wipe needs undoing** → the Super-Admin console's revert
   for the matching snapshot (`clean_slate_snapshots` /
   `history_reset_snapshots` keep one recoverable snapshot each).
3. **Bad data from a migration or bug, scoped to known tables** → restore
   those tables from your manual dump (`psql` the relevant `COPY`/`INSERT`
   sections) — never the whole dump over a live database.
4. **The database itself is lost or corrupted** → Supabase Dashboard →
   Database → Backups → **Restore**. This rewinds the entire project to the
   snapshot time; everything written since is gone. Announce to the admins
   before pulling this lever, and re-run `supabase migration list` afterwards
   to confirm schema parity with `main`.

After any restore: sign in, spot-check Care · Plan · Multiply, and confirm
the most recent `audit_events` rows look right — the audit spine is the
fastest truth-check for "what state did we come back to?".
