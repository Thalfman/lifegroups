# Product-Readiness Evaluation — 2026-07-14

| Evaluation fact | Value                                                                                  |
| --------------- | -------------------------------------------------------------------------------------- |
| Evaluation name | **2026-07-14 Product-Readiness Evaluation**                                            |
| Question        | Is this app ready to put in front of real users with real pastoral data?               |
| Evaluated ref   | `main` at `60645f2` (post PR #890, the 2026-07-11 audit fixes)                         |
| Prior audit     | [`2026-07-11-full-codebase-audit.md`](./2026-07-11-full-codebase-audit.md)             |
| Report path     | `docs/audits/2026-07-14-product-readiness-evaluation.md`                               |
| Change boundary | Report only (plus its index entry); no code, configuration, issue, or workflow changes |

Unlike the periodic full-codebase audits (which hunt for defects), this
evaluation answers a launch decision: **should real users — the Ministry Admin,
the Super Admin, Over-Shepherds, and Shepherds — start using this with real
care data, and if not now, what has to happen first?** It reviews three axes:
product completeness, engineering/operational readiness, and security & data
safety. Sources: the codebase at the evaluated ref, the three prior audits,
ADRs 0001–0039, the runbooks, and local check runs (verification record in §7).

## 1. Executive summary

**Recommendation: conditional GO.** Launch to the trusted core team after a
short pre-launch checklist (§5) that is measured in days of verification and
wiring, not weeks of building. The product surface is complete for its job,
the security posture is unusually strong for an app of this size, and the
remaining gaps are operational (alerting, production env verification, the
login-throttle decision) rather than missing features or open exposures.

The three-axis picture:

- **Product:** All post-pivot surfaces — Care · Plan · Multiply, Groups,
  People, Settings, the Super-Admin console, the Over-Shepherd surface, and
  the Shepherd (leader) surface — are shipped and cohesive. The full account
  lifecycle (invite → set password → self-name → role-scoped surface →
  password reset → account deletion) works end-to-end: invite redemption has
  real-stack E2E proof, and password reset and account deletion are covered
  by unit/integration tests (`tests/integration/profile-purge.test.ts`).
  There are no stubs, no TODO debt, and no placeholder surfaces a real user
  could stumble into.
- **Engineering:** lint and typecheck pass, and the ~4,275-test gating suite
  is green in CI; locally 4,274 of 4,275 pass, the one failure being a
  sandbox-only environmental miss of the react-dom patch guard (§7).
  31 fitness invariants machine-enforce the security posture in the
  required CI lane; production already exists (Vercel + Supabase Pro,
  `fvclifegroups.vercel.app`); and a complete runbook set covers release,
  backup/restore (with a drill), incident response, and observability.
- **Security:** three consecutive self-audits found **zero P0 / cross-tier
  exposure**. The 2026-07-11 audit's four P1s are remediated or tracked
  (§4.3). The single most sensitive boundary — Care Note visibility — is
  verified behaviorally against a pinned mirror of its RLS clause (ADR 0037),
  not just structurally.

What stands between "engineered well" and "ready for real users" is a short
list: nothing is watching the emitted alerts, the production environment
wiring (SMTP, rate-limit credentials) has to be verified rather than assumed,
and the login action has no app-level throttle.

## 2. Product completeness

### 2.1 What's shipped

Every surface on the current nav spine is complete and matches the route table
in [`PRODUCT_DEFINITION.md`](../PRODUCT_DEFINITION.md):

| Surface                                              | Route                                                                                               | State                                                               |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Home dashboard (triage + vitals)                     | `/admin`                                                                                            | Complete                                                            |
| Care (5 tabs incl. all-Notes feed)                   | `/admin/care` + shepherd-care detail                                                                | Complete (ADR 0023 authorship included)                             |
| Plan (Interest Funnel)                               | `/admin/plan`                                                                                       | Complete; message _sending_ deliberately provider-deferred (README) |
| Multiply (Readiness · Pipeline · Shepherds)          | `/admin/multiply`                                                                                   | Complete (ADRs 0022/0030/0034)                                      |
| Groups / People                                      | `/admin/groups`, `/admin/people`                                                                    | Complete, seeded on (ADR 0024)                                      |
| Settings (incl. A–F rubric editors)                  | `/admin/settings`                                                                                   | Complete (ADR 0018)                                                 |
| Super-Admin console (7 workspaces incl. Danger Zone) | `/admin/super-admin`                                                                                | Complete                                                            |
| Over-Shepherd surface                                | `/over-shepherd`                                                                                    | Complete, coverage-scoped (ADR 0017)                                |
| Shepherd (leader) surface                            | `/leader`                                                                                           | Complete, live by default (ADR 0024)                                |
| Auth/onboarding                                      | `/login`, `/invite/[token]`, `/welcome`, `/forgot-password`, `/reset-password`, `/account-deletion` | Complete, with first-run orientation                                |

Supporting evidence of maturity:

- **No TODO debt.** A repo-wide sweep found no `TODO`/`FIXME`/`HACK` markers
  and no "not yet implemented" strings in runtime code. The only
  "placeholder" hits are intentional config fallbacks
  (`lib/support/contact.ts`) and stale comments.
- **No confusing demo surfaces.** Without env vars, protected routes redirect
  to `/login`; only the env-gated `/a11y-harness` renders demo data. The old
  public preview routes are gone (prior audit SEC-6, closed).
- **The frozen pre-pivot surfaces are intentional**, not half-finished:
  `/admin/planning`, `/admin/guests`, `/admin/check-ins`, etc. resolve by
  direct URL but are hidden behind Super-Admin nav flags per ADR 0016/0033.

### 2.2 Development trajectory

The last ~40 commits are hardening and consolidation, not feature-building:
audit-driven fixes (PR #890 landed within days of the 2026-07-11 audit; all
39 findings of the 2026-07-03 audit were closed within 8 days), profile-purge
correctness, E2E infrastructure, and RLS polish. ADRs 0035–0039 are all
internal-quality decisions. The product surface is settled.

### 2.3 Open product items

None are launch-gating for the core team:

- Frozen pre-pivot surfaces still answer old bookmarks with old vocabulary
  ("Guests", "check-in"); a "this moved" redirect would be a nice touch.
- Care follow-up due dates compute against UTC, not church-local time, so
  work can read as due a day early in the evening (prior audit ARCH-2, P2).
- Documented design debt: ~2,000 inline styles and two coexisting
  button/color systems (PRODUCT_DEFINITION §8) — cosmetic, scheduled work.

## 3. Engineering & operational readiness

### 3.1 What's strong

- **Test discipline:** 414 Vitest files / ~4,275 cases in the gating lane,
  31 fitness-invariant files (`tests/fitness/`), a 26-spec a11y lane, 6
  real-stack E2E specs (`tests/e2e/`), and a 4-file RLS/action integration
  lane. CI (`.github/workflows/ci.yml`) gates every PR on
  lint → typecheck → build → test:run plus a path-gated embedded RLS harness;
  weekly drift lanes cover E2E, RLS integration, and seeded-auth smoke.
- **Deployment is real, not aspirational:** git-integrated Vercel deploy
  (`main` → production), a named Supabase Pro project with daily backups, and
  a schema-first release rule in [`RELEASE.md`](../runbooks/RELEASE.md) born
  from an actual drift incident.
- **Runbooks exist and are specific:** release, backup & restore (including a
  restore drill with RTO/RPO capture), incident response (SEV1–3 with
  care-data-first containment), observability SLOs, and a launch checklist
  ([`LAUNCH_RUNBOOK.md`](../runbooks/LAUNCH_RUNBOOK.md)).
- **Observability emission is thorough:** structured one-line JSON logs
  (`lib/observability/`), per-action instrumentation, `read_bundle` timing,
  PII-safe web-vitals and client-error reporters, Vercel Analytics + Speed
  Insights.

### 3.2 Open engineering/operational items

| #   | Item                                                                                                                                                                                                                                                                                                                                                    | Tier          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| O-1 | **No live alerting.** Signals are emitted but nothing watches them: no error-monitoring service, no wired log drain, no paging path. [`OBSERVABILITY.md`](../runbooks/OBSERVABILITY.md) defines "page immediately" conditions (RLS bypass, audit-insert failure) with no pager behind them.                                                             | Launch-gating |
| O-2 | **Production env wiring unverified.** Rate limiting fails open and silent when `UPSTASH_REDIS_REST_URL`/`TOKEN` or `RATE_LIMIT_HMAC_SECRET` are absent (`lib/security/rate-limit.ts`); invites/password resets silently fail to deliver without custom SMTP (`FREE_TIER_NOTES.md`); `TRUSTED_PROXY` must match the host for per-IP throttles to engage. | Launch-gating |
| O-3 | **Manual migration application** (`supabase db push`) relies on the release runbook alone; prod/main drift has happened once already.                                                                                                                                                                                                                   | Pre-scale     |
| O-4 | **E2E is not a required merge gate** (prior audit TEST-1) — the stable 6-spec real-stack lane reports on PRs but a red E2E doesn't block merge.                                                                                                                                                                                                         | Pre-scale     |
| O-5 | **CSP is report-only** (`next.config.ts`); flipping to enforcing is a deferred decision.                                                                                                                                                                                                                                                                | Pre-scale     |
| O-6 | **A patched react-dom runs in production:** Next 16.2.9 vendors a react-dom canary predating React #36134, fixed by an exact-SHA postinstall patch (`scripts/patch-next-react-dom-36134.mjs`) guarded by a fitness test. Well-engineered, but real debt scheduled for removal at Next 16.3.                                                             | Pre-scale     |
| O-7 | 4 moderate `npm audit` findings — one transitive build-time postcss issue via Next; effectively wontfix, low real-world risk for a server-rendered admin app.                                                                                                                                                                                           | Polish        |

## 4. Security & data safety

### 4.1 What's demonstrably strong

- **The invariants are machine-checked, not just documented.** The fitness
  suite enforces, in the required CI lane: no service-role key in runtime
  code, no `select("*")`, no direct table writes, no hardcoded identity, no
  hard deletes, no broad RLS read policies, audit-pairing on every write RPC,
  pinned `search_path` on every `SECURITY DEFINER` function, RLS-coverage
  completeness derived from the data-classification manifest, pinned
  revalidate-path sets, and leader allowlists that can never name
  `admin_private_note`.
- **The most sensitive boundary is verified behaviorally.** ADR 0037's
  divergence test pins the Care Note RLS `USING` clause verbatim and runs the
  production TypeScript resolver and a SQL mirror over a 540-row exhaustive
  matrix, asserting identical decisions — including that the Super Admin gets
  no bypass broader than the Ministry Admin.
- **RLS coverage is exhaustive by construction.** Every sensitive table must
  be asserted or explicitly deferred (`tests/fitness/rls-coverage-completeness.test.ts`),
  and a DB event trigger auto-enables RLS on any new `public` table, failing
  closed.
- **Auth is fail-closed:** `getUser()` gates every protected request, the
  idle-timeout guard treats a missing activity marker as expired, and
  invite/recovery sessions are pinned to `/reset-password` until a password
  exists. No open signup — accounts require a valid 256-bit invite token.
- **The two visibility exceptions work as specified:** the Ministry Admin's
  Private Care Note is creator-scoped (hidden even from the Super Admin);
  author-private Care Notes unlock only via the transparency grant.
- **No secrets committed;** the service role is confined to the Edge
  Functions, which are hardened (timing floors against email enumeration,
  HMAC'd IPs, generic error codes). Note the fourth function,
  `manage-test-auth-users`, is local/test tooling only — the
  [launch runbook](../runbooks/LAUNCH_RUNBOOK.md) requires deleting it from
  production, which must then show exactly `invite-user`, `redeem-invite`,
  and `purge-profile-auth` (verified in §5 item 1).

### 4.2 Open security items

| #   | Item                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Tier          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| S-1 | **No app-level login throttle.** `app/login/actions.ts` relies solely on Supabase GoTrue's built-in rate limits, while forgot-password and invite-redeem have explicit throttles. Needs a deliberate decision (add one, or confirm GoTrue limits are configured to taste).                                                                                                                                                                                                                                                              | Launch-gating |
| S-2 | **Privacy-copy truthfulness — verified consistent at the evaluated ref.** The deletion/privacy copy (`app/account-deletion/page.tsx`, `app/privacy/page.tsx`) and the canonical glossary (`CONTEXT.md` permanent-deletion definition) were checked against shipped erasure behavior and match: no recoverable profile copy, a structural non-restorable deletion record, audit attribution removed. This closes prior-audit DOC-1. Remaining ask is only a one-time production spot-check of the deletion flow (folded into §5 item 4). | Resolved      |
| S-3 | **RLS semantics beyond Care Notes are review-dependent.** Only care_notes/prayer_requests have the behavioral differential; other tables rely on the static sweep + review. 18 sensitive tables are deferred to the static sweep with no live per-tier fixture. Reasonable for a trusted team; promote the live RLS lane before broadening the user base.                                                                                                                                                                               | Pre-scale     |
| S-4 | **Admin-private columns on mixed tables are guarded by read-layer allowlists, not RLS** (`groups.admin_notes` etc.) — enforced by the no-`select("*")` and leader-allowlist fitness tests, but it is a column boundary held by static checks + review rather than the database.                                                                                                                                                                                                                                                         | Pre-scale     |
| S-5 | Public telemetry endpoints (`/api/vitals`, `/api/client-error`) are session-exempt and log caller-supplied content with truncation, not redaction (prior audit P2).                                                                                                                                                                                                                                                                                                                                                                     | Polish        |

### 4.3 Status of the 2026-07-11 P1s at the evaluated ref

| Prior ID | Status                                                                                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SEC-1    | **Fixed** — `20260718010000_irreversible_profile_erasure.sql` reduces profile tombstones to structural metadata, and the public copy matches (S-2).                                  |
| SEC-2    | **Fixed in code** — `20260718000000_harden_invite_throttle_retention.sql` purges legacy literal-IP rows and enforces the `ip:v1:<hex>` HMAC constraint; `rate-limit.ts` HMACs first. |
| TEST-1   | **Open** — tracked here as O-4.                                                                                                                                                      |
| DOC-1    | **Fixed** — `CONTEXT.md`'s permanent-deletion definition now describes the linked database + Auth erasure workflow with no recoverable snapshot (verified, S-2).                     |

## 5. Recommendation: conditional GO

**Launch to the trusted core team — the Ministry Admin and Super Admin first,
then Over-Shepherds and Shepherds — after completing this checklist.** Every
item is verification or wiring; none requires building new product.

1. **Verify production environment wiring (O-2).** Confirm in the live Vercel
   project: custom SMTP is configured and a real invite email arrives;
   `UPSTASH_REDIS_REST_URL`/`TOKEN` and `RATE_LIMIT_HMAC_SECRET` are set (and
   no `rate_limit_disabled` lines appear in logs); `TRUSTED_PROXY` matches
   the host. On the Supabase side: `RATE_LIMIT_HMAC_SECRET` is **also** set
   as an Edge Function secret — `redeem-invite` hard-fails with
   `missing_rate_limit_hmac_secret` without it, so a Vercel-only check can
   pass while invite redemption is broken; and `manage-test-auth-users` is
   absent from the production project's Edge Functions (test tooling the
   launch runbook deletes). Confirm migrations through `20260718020000` are
   applied to prod per the [release runbook](../runbooks/RELEASE.md).
2. **Wire one real alerting path (O-1).** Add an error-monitoring service or
   a log drain with alerts for the "page immediately" conditions in
   [`OBSERVABILITY.md`](../runbooks/OBSERVABILITY.md). One channel that a
   human actually sees is enough at this scale.
3. **Decide the login-throttle question (S-1).** Either add an app-level
   throttle to `app/login/actions.ts` using the existing
   `lib/security/rate-limit.ts` machinery, or explicitly confirm and record
   that GoTrue's configured limits are acceptable.
4. **Run the existing [`LAUNCH_RUNBOOK.md`](../runbooks/LAUNCH_RUNBOOK.md)**
   as written, including a one-time spot-check that the production deletion
   flow behaves exactly as `/account-deletion` describes (the copy was
   verified truthful at the evaluated ref — S-2).

Rationale: the audience is a small, trusted, known team using a purpose-built
tool; there is no cross-tier exposure, no missing feature on the critical
path, and production infrastructure already exists. Holding launch for the
pre-scale ladder (§6.2) would delay real feedback for hardening whose value
only materializes with more and less-trusted users.

## 6. Other options considered

### 6.1 Launch immediately, as-is — rejected

Everything technically works today, and for a day-one audience of two admins
the risk is small. Rejected because two of the gaps are precisely the kind
that don't announce themselves: rate limiting **fails open silently** if the
production credentials were never set, and invites **silently fail to
deliver** without SMTP — both would be discovered by a confused or exposed
user rather than by an operator. For a pastoral-care tool, discovering those
gaps through users rather than checks is a trust cost out of proportion to
the few days the checklist takes.

### 6.2 Hold for full hardening first — rejected

The maximal version: make E2E a required merge gate, promote the live
per-tier RLS lane, flip CSP to enforcing, automate migration application,
remove the react-dom patch at Next 16.3, fix the church-local-time and
false-empty-read P2s, and unify the design system before any real user signs
in. Rejected as the launch bar: these items' value scales with user count and
codebase churn, not with day-one usage by two trusted admins, and several
(the Next 16.3 patch removal, E2E promotion) have external sequencing
dependencies. Deferring launch for them trades real usage feedback for
protection against risks the core team doesn't yet face. They are the right
**post-launch ladder**, in roughly this order:

1. Promote E2E to a required merge gate (O-4) — first, because it guards all
   subsequent change.
2. Reconcile the remaining P2 correctness items users will actually feel:
   church-local due dates, false-healthy empty states on failed privileged
   reads, Super-Admin console first-load fan-out.
3. Before widening beyond the core team: promote the live per-tier RLS lane
   (S-3), flip CSP to enforcing (O-5), automate migrations (O-3).
4. At Next 16.3: remove the react-dom patch (O-6).

### 6.3 Staged rollout: admins first, Shepherds later — viable middle path

Because the Shepherd surface sits behind the verified `leader_surface` flag,
a two-stage launch is one toggle: complete the checklist, launch to the
Ministry Admin and Super Admin, run for a week or two, then re-enable the
flag for Shepherds once the alerting channel has proven quiet. There is a
real evidence asymmetry supporting this path: the Shepherd surface is
guarded by the same fitness invariants and RLS posture, but its E2E presence
is route/visibility handshakes (the assigned Shepherd sees the group on
`/leader`; invite redemption) rather than Shepherd-authored write flows, and
several leader-scoped tables (`guests`, `follow_ups`, `attendance_sessions`,
`group_health_updates`) are still deferred from live per-tier RLS assertions
(S-3). The §5 rollout order (admins first, then Over-Shepherds and
Shepherds) already accommodates this staging — treat the widening step as
the natural point to add Shepherd-authored E2E coverage or promote the live
RLS lane, per the post-launch ladder in §6.2.

## 7. Method, verification record, and limitations

Three parallel deep reviews (product completeness; engineering/operations;
security and data safety) over the codebase, `docs/`, ADRs 0001–0039, the
three prior audits, and the runbooks, plus local check runs at the evaluated
ref:

| Check                  | Result                                                                                                                                                                                                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`    | **Pass.**                                                                                                                                                                                                                                                            |
| `npm run lint`         | **Pass.**                                                                                                                                                                                                                                                            |
| `npm run test:run`     | 414 files; **4,274 passed, 1 skipped, 1 failed** — the single failure is `tests/fitness/next-react-dom-36134-patch.test.ts`, environmental to this sandbox (pre-installed `node_modules` without the postinstall patch applied); it is green on a clean CI `npm ci`. |
| `npm audit --omit=dev` | 4 moderate (one transitive build-time postcss issue via Next; see O-7).                                                                                                                                                                                              |

Limitations: production state (env vars, applied migrations, SMTP, Supabase
Pro settings, branch protection) was read from the repo's documentation and
audit records, **not probed live** — which is exactly why checklist item 1
verifies rather than assumes it. The RLS integration, a11y, and E2E lanes
were not run locally (no local Supabase stack in this environment); their
status is taken from CI configuration and the 2026-07-11 audit's verification
record. This was not a dependency/CVE deep-scan, load test, or penetration
test.
