# ADR 0006: The in-app multiplication planner supersedes the Google Doc by adoption

**Status:** Accepted
**Date:** 2026-05-30
**Supersedes:** the open question in [ADR 0004 / D7](./0004-systems-conversation-architecture.md) and PRD Q11 ("is the in-app pipeline the system of record, or does the Google Doc stay master?")

## Context

PRD Q11 left one decision owed by Julian: whether the in-app multiplication
pipeline is the system of record, or whether his Google Doc
([`../julian-inputs/LG_MULTIPLICATION_PLAN_2026.md`](../julian-inputs/LG_MULTIPLICATION_PLAN_2026.md))
stays master. This blocked nothing technically, but it was framed as a decision
to *solicit from Julian* — and an unanswered governance question is a poor thing
to put in front of a busy Ministry Admin.

Reviewing what already ships, the in-app pipeline already models most of the
Doc:

- **Named multiplication candidates** with target year, status
  (`watching / planned / launched / deferred`), the manual readiness flags, and
  notes — `multiplication_candidates` (migration `20260528160000`).
- **Readiness against Julian's five criteria** — computed in
  `lib/admin/multiplication.ts` (12+ members, 3+ years, co-shepherd 1+ year,
  shepherd willing, need for a similar-stage group).
- **Segmentation by audience × life stage** — `groups.audience_category`
  (`men / women / mixed`) and `groups.life_stage` (migration `20260528150000`),
  matching the Doc's gender-category × age-bracket grouping.

So the gap is **not** "build a multiplication tracker" — it largely exists. The
gap is (a) the Doc's data has never been loaded, (b) a few Doc fields aren't
modelled, and (c) the pipeline lives as a panel inside Launch Planning rather
than a dedicated, Doc-replacing surface.

## Decision

**Do not ask Julian to choose a system of record. Make the in-app planner the
obviously-better tool and let it win by adoption.** Concretely:

1. **Promote** the multiplication pipeline from a panel inside Launch Planning
   to its **own admin surface** ("Multiplication" tab) — a cleaner, more
   editable replacement for the Google Doc.
2. **Seed** the planner from the saved markdown
   ([`LG_MULTIPLICATION_PLAN_2026.md`](../julian-inputs/LG_MULTIPLICATION_PLAN_2026.md))
   so Julian opens a **populated** tab, not a blank one.
3. **Extend the model** with the Doc fields not yet captured (see below).
4. **Treat the 2026 vs. 2027 split as in-app data, not a decision.** The source
   Doc does not unambiguously assign each group to a timeline bucket; rather than
   asking Julian to resolve it on paper, he sets each group's `target_year` **in
   the app**, where it is audited and sortable.

The "who is master" question dissolves: once the app holds the same data, better
organised and live against real group/membership records, it *is* master in
practice. We document the app as authoritative and retire the Doc when Julian is
ready — no decree required.

## Data-model extensions

All additive, all nullable, all through the existing audited admin write path
(`runAdminWriteAction` → `SECURITY DEFINER` RPC + paired `audit_events`); no new
write RLS, no hard deletes (archive via `archived_at`), consistent with the
existing pipeline.

- **Successor / leader-designate** on `multiplication_candidates` — the Doc's
  second `(Name)` (e.g. `(Tony L.)`, `(Cindy Kessaris)`) reads as the
  apprentice/leader intended to carry the multiplied group. This is distinct
  from the *existing* co-shepherd tenure signal, which is derived from
  `group_leaders` and feeds the readiness criterion. Net-new field.
- **Meeting time** (`during the day` / `evening`) — present in the Doc, not yet
  modelled. Captured so the planner can honour the "two options per person"
  goal. Whether this lands on `groups` or on the candidate is a build-slice
  call; the planner needs to *display and edit* it either way.
- **Uncertainty / provenance** — the Doc's `(?)` markers and the
  reconciliation caveats (header counts that don't match listed leaders) are
  carried as notes during seeding, not as schema.

## Deferred (explicitly out of scope here)

- **"Launch from scratch" interest lists** — the Doc lists *people interested*
  in a not-yet-existent group (e.g. "Karl and Lori Asen"). These cannot be
  `multiplication_candidates` (which FK to a real `groups` row) and need a
  net-new prospective-group / interest model. Deferred to a later slice so the
  Doc-replacing tab ships first.
- **Retiring the markdown source file.** It stays in `julian-inputs/` as the
  provenance record until the seeded data is confirmed in-app.

## Why (not the alternatives)

- **Asking Julian to pick a master is the wrong shape of question.** Adoption is
  decided by which tool is better to use, not by a governance ruling. Building
  the better tool answers Q11 without spending Julian's attention on it.
- **Seeding beats a blank tab.** A populated planner he can correct is far more
  likely to displace the Doc than an empty form he must re-enter from scratch.
- **Extending the existing model beats a new one.** `multiplication_candidates`
  + segmentation already encode Julian's criteria and the audit/RLS patterns;
  bolting on two fields is cheaper and safer than a parallel system.

## Revisit if

Julian keeps maintaining the Google Doc in parallel after the seeded tab ships —
that would signal the in-app surface is missing something the Doc still does, and
we reopen the gap analysis (likely the deferred from-scratch lists) rather than
re-litigating system-of-record.
