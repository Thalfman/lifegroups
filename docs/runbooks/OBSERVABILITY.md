# Observability & SLOs

What we watch, the service levels we hold ourselves to, and when an alert fires.
Signals map to the structured logging the app already emits
(`lib/observability/`): one JSON line per server action / read bundle, carrying
`event`, `outcome` (`ok | fail | denied | throttled`), `actor_role`,
`route_or_action`, `request_id`, `latency_ms`, and `error_code`. Reads emit a
`read_bundle` line per surface (`lib/observability/read-timing.ts`) with
`outcome` and `latency_ms` and **no private data** (row contents, names, and
care/prayer text are dropped).

> **SLOs and alert thresholds below are tunable initial defaults**, not
> contractual targets. Start here, watch the signal, and adjust. No personal
> contact details live in this doc — wire the actual paging path into your ops
> tooling.

## Key signals

Collect these from the log drain (every line is one structured event) plus the
hosting platform's metrics:

- **Error rate** — share of action/read lines with `outcome: "fail"`.
- **Failed auth / authorization** — `outcome: "denied"` on auth and guarded
  actions; a spike can mean a probing attempt or a broken gate.
- **Failed RPC calls** — write actions whose `SECURITY DEFINER` RPC errored
  (`outcome: "fail"` with an RPC `error_code`).
- **Failed audit inserts** — any mutation path where the paired `audit_events`
  write did not land. This is the highest-signal integrity alarm.
- **Read-bundle degradation** — rate of `read_bundle` lines with
  `outcome: "fail"` (reads degrade gracefully, so a silent rise here means
  surfaces are quietly suppressing real data).
- **Edge Function failures** — `invite-user`, `redeem-invite`, and
  `purge-profile-auth` error rates; for profile purges, alert on the
  `auth_user_delete` and `auth_delete_audit` partial-failure stages.
- **Invite redemption failures** — `redeem-invite` failures excluding
  expired/invalid tokens (those are expected user error).
- **Slow admin pages** — `latency_ms` tail (p95/p99) on `/admin/*` actions and
  read bundles.
- **RLS-denied anomalies** — unusual volume of `denied` outcomes, or any read
  returning rows a tier should not see (correlate with the RLS sweeps).

## SLOs (tunable initial defaults)

| Objective                 | Target (initial)  | Notes                                                      |
| ------------------------- | ----------------- | ---------------------------------------------------------- |
| Admin app availability    | **99.5% / month** | Successful page/app responses.                             |
| Critical mutation success | **99% / month**   | Excludes validation failures (user error, not an outage).  |
| Audit write coverage      | **100%**          | For every write-classified RPC — non-negotiable invariant. |
| Invite redemption success | **99% / month**   | Excludes expired/invalid tokens.                           |

## Alert thresholds (tunable initial defaults)

Page-immediately conditions are integrity/confidentiality failures — they map to
SEV1 in `INCIDENT_RESPONSE.md`:

| Condition                                              | Action           |
| ------------------------------------------------------ | ---------------- |
| Suspected **RLS bypass**                               | Page immediately |
| **Service-role exposure** (key in runtime/logs/client) | Page immediately |
| **Audit insert failure** on a mutation path            | Page immediately |
| Edge Function failure rate **> 5% for 10 min**         | Alert            |
| App error rate **> 2% for 10 min**                     | Alert            |
| Read-bundle degraded **> 10% for 15 min**              | Alert            |

## How signals tie back to the code

- Structured logger and fields: `lib/observability/logger.ts`,
  `lib/observability/instrument.ts` (per-action terminal line).
- Read-bundle timing: `lib/observability/read-timing.ts` (`read_bundle` lines).
- PII-safe correlation: `lib/observability/identifiers.ts` (`request_id`,
  salted email hashes — never raw emails).
- Audit spine: every `SECURITY DEFINER` write RPC writes a paired
  `audit_events` row in the same transaction (see `AGENTS.md` and
  `RLS_VISIBILITY.md`). `audit_events` is Super-Admin-only by RLS.

> **Note on authed local timing.** Authenticated `/admin/*` routes can't be
> timed locally (they redirect to `/login` without Supabase env). Server read
> latency is a production signal collected from the log drain, not a local
> benchmark.
