# Re-open Leader and Over-Shepherd logins; the author-private Care Note

The pivot (ADR 0016) needs Over-Shepherds and Leaders to log in: an
Over-Shepherd records care about their Leaders, and a Leader records care about
their group members. This re-opens the Leader surface that ADR 0002 froze and
gated off, and promotes the Over-Shepherd tier to a full login. It amends
ADR 0002 (leader gating) and operates under ADR 0009.

## The two gates still bind

ADR 0009's **verify-before-flip** rule is unchanged: the Leader-facing routes and
RLS must be re-audited as part of landing this, and the leader-surface flag only
enables once that verification marker is set. **LDR.1** is unchanged: the Leader
surface opens only with Julian's explicit product go-ahead — which this pivot
_is_, since the pivot is Julian's. Tom holds the switch; Julian holds the
decision; the flag toggles an already-re-verified surface, never a dormant one.

## What each tier does on login

- **Over-Shepherd** — the Care accordion scoped to their covered Leaders; writes
  Care Notes and Prayer Requests about those Leaders.
- **Leader / Co-Leader** — a care surface over their group's existing roster
  (members shown as people to care for, **not** as counts); writes Care Notes and
  Prayer Requests per member; sees their group calendar. The roster is kept
  current by Julian's own methods; the assignment/number UI stays hidden
  (ADR 0016). Co-Leaders get the same surface as Leaders. The "Connect to Group
  Leader" funnel step is back-office only — nothing about a Prospect surfaces to
  the Leader.

## The Care Note: a second deliberate exception to the ladder

A **Care Note** (and a **Prayer Request**) is **private to its author** by
default — the OS who wrote it, or the Leader who wrote it. The Ministry Admin can
read a given person's Care Notes only when he flips that person's **transparency
toggle** on (an inline, per-person pastoral act in Care); when he can, the Super
Admin can too, by the normal ladder. This is the _second_ deliberate hole in the
"higher tiers see everything below" ladder, alongside the Private Care Note.

The two are kept distinct: the **Private Care Note** is the Ministry Admin's
_own_ note, hidden even from the Super Admin (ADR 0003); the **Care Note** is an
_Over-Shepherd's or Leader's_ note, hidden from Julian until he is granted the
peek. They are different tables with different RLS; do not merge them.

## Consequences

- Leader-facing RLS moves from dormant to live attack surface and must be
  re-audited before the flag flips (ADR 0009). The private-care-note guarantee
  must continue to hold regardless of flag state.
- A new per-person `notes_transparency` grant governs Ministry-Admin read access
  to Care Notes / Prayer Requests; default denied (sealed to author).
- `staff_viewer` and the rest of the ladder are unaffected.
- **Leader-calendar past-date rule (#376):** the leader calendar READS the full
  requested month including past dates — a leader may page back and _see_ prior
  occurrences as care context — while every calendar row stays RLS-scoped to the
  leader's group via `auth_is_leader_of()`. The read window is deliberately not
  clamped to today; write-ability of past dates is governed separately by the
  grid's `canEdit` and the calendar RPCs, not by the read window.
