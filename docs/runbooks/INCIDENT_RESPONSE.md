# Incident Response Runbook

How we classify and respond to a production incident on the LifeGroups admin
operating system. The app holds pastoral-care data that exists nowhere else
(Care Notes, Prayer Requests, the shepherd-care history, the `audit_events`
spine), so the response always prioritises **containment** and **preserving the
audit trail** over a fast cosmetic fix.

> Severity definitions and the response flow are operational defaults. Tune the
> examples and thresholds as the product and on-call rota mature. This runbook
> intentionally contains **no personal contact details** — wire the actual
> notification path (pager, channel, rota) into your ops tooling, not here.

## Severity levels

### SEV1 — critical (data or trust at risk)

A confidentiality, integrity, or availability failure that exposes data or takes
the system down. Page immediately.

- **Data leak** — sensitive rows (`care_notes`, `prayer_requests`, the encrypted
  Private Care Note, PII) reachable by a tier that must not see them.
- **Auth bypass** — a user reaching a surface or action without the required
  role.
- **RLS bypass** — a query returning rows RLS should have filtered (e.g. a
  Ministry Admin reading `audit_events`, or any tier reading the Super-Admin-only
  / encrypted-private tables).
- **Service-role exposure** — the service-role key present in Next runtime, in
  logs, or in client-reachable code (it is confined to Edge Functions).
- **Production outage** — the admin app is down or unusable.
- **Corrupted data** — destructive writes, a bad migration that rewrote data, or
  audit rows missing for mutations that occurred.

### SEV2 — major (workflow broken, no leak)

Degraded operation without a confidentiality breach. Respond same-day.

- A broken admin workflow (a core Care/Plan/Multiply action failing).
- Failed invites (Edge Function `invite-user` / `redeem-invite` erroring) or
  a `purge-profile-auth` partial failure requiring a tombstone-backed retry.
- Degraded reads (a read bundle consistently failing, suppressing real data).
- Delayed audit visibility (audit rows landing late or the audit surface lagging).

### SEV3 — minor

Low-impact defects. Schedule into normal work.

- Minor UI defects with no data or auth impact.
- A non-critical scheduled-job failure (e.g. the weekly RLS integration lane).
- A docs/behaviour mismatch.

## Response flow

Work the steps in order. Do not skip **Preserve audit evidence** — the audit
spine is how we reconstruct what happened.

1. **Triage** — assign a severity from the table above. If unsure between two
   levels, take the higher one. Note the start time.
2. **Contain** — stop the bleeding before fixing. Revoke/rotate an exposed
   credential, take a leaking surface offline (or flip its nav/feature flag off),
   or block the offending path. For a suspected data leak, contain first and
   diagnose second.
3. **Preserve audit evidence** — capture the relevant `audit_events` rows and
   structured logs (filter by `event`, `outcome`, `request_id`,
   `actor_role`) **before** any remediation that could overwrite them. Take a
   manual `pg_dump` snapshot if data integrity is in question (see
   `BACKUP_AND_RESTORE.md`).
4. **Communicate internally** — notify the on-call owner and the admins through
   the configured channel. State severity, blast radius, and whether care data
   may be involved.
5. **Fix or roll back** — prefer a targeted fix that keeps the
   validate → guard → RPC → audit pipeline intact. If the fix is risky or slow,
   roll back the deploy/migration instead. Never patch by writing tables
   directly or by widening RLS to "make it work".
6. **Verify RLS + audit integrity** — confirm the offending visibility is closed
   (re-run the relevant checks: the static RLS sweep, and the live RLS
   integration lane against a stack), and that every mutation in the incident
   window has its paired `audit_events` row.
7. **Write post-incident notes** — record timeline, root cause, blast radius,
   the fix, and follow-ups. Convert systemic gaps into issues. Keep notes free of
   raw care/prayer text — reference record IDs, not bodies.

## Guardrails during an incident

- **No hard deletes.** Archive (soft) is the only normal way data leaves a
  surface; permanent deletion is Super-Admin-only and writes a tombstone.
- **Writes stay on the rails.** Even under pressure, mutations go through the
  narrow `SECURITY DEFINER` RPCs so the audit pairing holds.
- **Respect the two visibility exceptions.** Do not "temporarily" expose the
  Ministry Admin's encrypted Private Care Note or author-private Care Notes to
  diagnose — they are sealed by design (see `RLS_VISIBILITY.md`).
