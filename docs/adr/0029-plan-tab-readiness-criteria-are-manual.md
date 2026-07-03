# The Plan tab's multiplication readiness criteria become a manual checklist

**Status:** Accepted — completed in the UI by
[ADR 0030](./0030-multiply-readiness-first-and-type-intent-pipeline.md).

The Multiply **Plan** tab shows, per candidate group, a row of readiness chips —
the five per-group criteria from ADR 0006 / `lib/admin/multiplication.ts`
(systems-conversation answer 10): **12+ members**, **3+ years as a group**,
**Co-Shepherd 1+ year**, **Shepherd willing**, and **Need for a similar group**.
Three of those were **computed** from live data (roster / `manual_member_count`,
`groups.launched_on`, the earliest active co-leader's `group_leaders.assigned_at`);
only the last two were manual flags stored on the candidate. Julian asked for the
three computed ones to become things he can tick himself. We decided to make
**all five purely manual**, candidate-stored booleans — a judgment checklist, not
a derived signal.

## Decisions

### 1. The three computed criteria become candidate-stored boolean flags

`multiplication_candidates` gains three additive, non-null-defaulting boolean
columns — `enough_members`, `established_long_enough`, `co_shepherd_tenured` —
alongside the existing `shepherd_willing` / `needs_similar_stage`. They are
written only through the re-threaded `admin_create_multiplication_candidate` /
`admin_update_multiplication_candidate` `SECURITY DEFINER` RPCs (each paired with
its `audit_events` row, per the write-path invariant), and edited as three more
checkboxes in the candidate add/edit form, mirroring `shepherd_willing`. The
thresholds in the labels ("12+", "3+ yr", "1+ yr") become **advisory text** —
the box reflects Julian's judgment, not a computed comparison. `launched_on` and
co-leader `assigned_at` are no longer read for this purpose.

### 2. No backfill — every existing candidate starts blank

The new columns default `false`, and we deliberately **do not** seed them from
today's computed answers. A group that currently auto-shows `✓ 12+ members` will
show the box unticked until Julian ticks it. We accepted this one-time visible
reset in exchange for a trivially simple, compute-free migration; the criteria
are a forward-looking planning judgment, not a historical record worth
preserving.

### 3. The Capacity Board stops computing the criteria, and drops its "meets X/5" annotation

The Capacity Board (`lib/admin/capacity-board.ts`, surfaced via
launch-planning) also computed these five criteria — as **context, never a
gate** — to annotate multiplication _suggestions_ ("meets 4/5"). But suggestions
are by definition **pre-candidate** groups, which now have no candidate row to
store ticks on. Rather than report **"meets 0/5"** on essentially every
suggestion — a false zero that says "meets nothing" when the truth is
"unassessed" — we **suppress the annotation entirely**, honoring the
graceful-degradation rule (a missing read suppresses derived output rather than
reporting a false zero). The suggestions themselves (at/over target + a
ready-to-lead apprentice) are unchanged.

## Considered and rejected

- **Manual override on top of the computed value (tri-state: auto /
  forced-on / forced-off).** The most behavior-preserving option, but Julian
  wanted a plain checklist, and the tri-state's storage and UI complexity
  bought nothing he asked for.
- **Confirmation-only** (the box records "acknowledged" but still reflects
  computed data). Rejected for the same reason — he wants to assert the answer,
  not just acknowledge a computed one.
- **Seeding the boxes from computed values at migration time.** Rejected per
  decision 2.

## Consequences

- This **reverses** the deliberate "compute, don't ask Julian to re-enter what
  the data already knows" stance recorded in `lib/admin/multiplication.ts`. The
  trade-off is explicit: less automatic bookkeeping, more direct control.
- These per-group criteria are now clearly distinct from the **computed,
  per-cell Multiplication Pillars / Trigger** (ADR 0018/0019/0021). They share
  the "12 / 3 / 1" numbers but are a different concept on a different surface;
  see the new **Multiplication Readiness Checklist** glossary entry. The
  per-cell rule and grid are untouched.
- `evaluateReadiness`'s data-derived inputs (`launchedOn`, `coShepherdSince`,
  `activeMemberCount`) are no longer used for these three criteria; the function
  reduces to reading the five stored booleans. Dead computation and its
  now-unused read-model plumbing are removed.
