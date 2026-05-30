# Status Checklist — where we stand

_Last reconciled: 2026-05-29. A plain checklist, nothing more. For the full
stage map see [`MASTER_BLUEPRINT.md`](./MASTER_BLUEPRINT.md); for the debt detail
see [`PRODUCT_ROADMAP.md`](./PRODUCT_ROADMAP.md) Appendix A._

Measured against the three jobs Julian named on **2026-05-27**
([`julian-inputs/SYSTEMS_CONVERSATION.md`](../julian-inputs/SYSTEMS_CONVERSATION.md) Q12).
Each shipped line cites the migration or PR so it can be verified in git.

---

## ✅ Shipped since Julian's 2026-05-27 feedback

**Reality check:** in the two days after that conversation (2026-05-28 → 05-29),
**36 commits touched application code and 16 new database migrations landed.** The
"no progress" feeling comes from the work being buried in docs, not from it being
absent.

### Job 1 — Know how my leaders are doing (Shepherd Care)
- [x] **SC.1A** Care profiles + interaction history — tables + admin RPCs with paired audit.
- [x] **SC.1B** Follow-up task list ("what I owe them next") — `shepherd_care_follow_ups` (PR #107).
- [x] **SC.2** Over-shepherd coverage tracking — who covers which shepherds.
- [x] **OS.1–OS.7** Over-shepherd role, login bridge, and coverage-scoped read RLS (migrations `20260529000000`–`20260529007000`).
- [x] **SC.3** Julian's care dashboard — triage buckets, attention queue, coverage view.
- [x] **SC.4** Private notes readable by Julian alone — **client-side zero-knowledge encryption** (PRs #112–#114; ADR 0003). Unreadable by Tom/super-admin/anyone else.
- [x] **P1** Configurable stale-contact threshold (`shepherd_care_stale_days`, default 60).

### Job 2 — Know what to launch and when (Launch Planning)
- [x] **LP.1** Capacity + demand model (church attendance, growth, participation %).
- [x] **LP.2** Forecast scenarios (Conservative / Expected / Stretch).
- [x] **P2** Capacity default = 12 with per-group "stay open" (`allow_over_capacity`).
- [x] **P3** Seasonality quick-fills (Next August / Next January).
- [x] **P4** Multiplication pipeline (`multiplication_candidates` with readiness rubric).

### Cleared reliability/security debt
- [x] **P0.3** Rate-limit forgot-password (per-IP + per-email).
- [x] **P2.7** Removed dead modules (`lib/permissions`, `lib/health`, `lib/reports`).

---

## ⏳ Genuinely remaining (engineering)

### Job 3 — Grade group health
- [ ] **P5** Group-health grading. **In discovery, not buildable yet** — waiting on
  Julian's rubric (see "Waiting on Julian" below and
  [`plans/GROUP_HEALTH_RUBRIC_DISCOVERY.md`](../plans/GROUP_HEALTH_RUBRIC_DISCOVERY.md)).

### Reliability / security debt still owed (PRD Appendix A / blueprint §G)
Not launch-blockers, but the "…reliably" bar in the README depends on these.
- [ ] **P0.1** Baseline observability — structured logging on auth/session/server-action/Edge paths.
- [ ] **P0.2** Harden `getCurrentSession()` — stop throwing 500s on transient read failures.
- [ ] **P1.4** Mitigate invite-flow timing side-channel.
- [ ] **P1.5** Reduce unsafe `as` casts (runtime-validated parsing).
- [ ] **P1.6** Expand the test suite beyond the Vitest scaffold.
- [ ] **P2.8** Refactor oversized components (calendar shell, check-in form, groups directory).
- [ ] **P2.9** Constrain remaining broad `select("*")` reads (privacy-sensitive paths first).
- [ ] **P2.10** Validate session caching semantics (role/profile consistency).

---

## ❓ Waiting on a decision from Julian (not blocking launch)

These shape refinements; none stops shipping Jobs 1 & 2.
- [ ] **Group-health rubric** — dimensions, weights, output shape, and how to capture
  "spiritual growth." **This one gates Job 3.**
- [ ] **Care cadence (Q5)** — one stale-contact window, or different windows for groups he
  oversees directly vs. those delegated to over-shepherds? And what values?
- [ ] **Care-status wording (Q2)** — keep `healthy / watch / needs_attention`, or adopt his
  fuller set (doing well / needs encouragement / needs follow-up / concern / inactive)?
- [ ] **Multiplication pipeline scope** — is the in-app pipeline the system of record, or does
  the Google Doc stay master? Plus pinning each candidate group to **2026 vs 2027**.

---

## In one line

Jobs 1 and 2 are **functionally shipped**; Job 3 is **blocked on Julian's rubric**;
the rest is **reliability/security debt** that doesn't block launch. If anything here
doesn't match what you see in the running app, that mismatch is the next thing to
chase — every shipped line above is traceable to a migration or PR.
