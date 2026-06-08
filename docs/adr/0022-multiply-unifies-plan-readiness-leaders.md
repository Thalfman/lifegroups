# Multiply unifies Plan, Readiness, and Leaders into one tabbed surface

The **Multiply** area becomes a single tabbed surface — **Plan · Readiness ·
Leaders** — that unifies the church's three faces of multiplication tracking. The
per-group **multiplication planner** (Julian's Doc, ADR 0006) and the **leader
pipeline** are re-homed out of the frozen Planning tab / off-nav route into the
visible Multiply area, alongside the per-cell **readiness grid** (ADR 0019/0021)
that already lived there. This is a **partial, intentional reversal of ADR 0016's
hiding** of those surfaces: the data and routes were always retained; this moves
the surface back into view and connects the three views into one story.

Status: accepted — amends ADR 0016 (for the multiplication surfaces only).

## Why

ADR 0016 collapsed the nav to Care · Plan · Multiply · Settings and hid the
Planning tab, on the premise that Julian had other methods for the data those
surfaces tracked. In practice the artifact Julian actually plans from — the
per-group list by Audience × life-stage, with target year, successor, and
member count (`LG_MULTIPLICATION_PLAN_2026.md`) — is exactly the per-group
planner that ADR 0006 built and seeded, now hidden behind the retired Planning
tab. The visible Multiply tab showed only the abstract per-cell readiness grid,
which answers "should we launch another group of this _type_?" but never shows
the named groups, who leads the next one, or the 2026/2027 split. The two never
told one story.

## The three tabs

- **Plan** (default) — the per-group multiplication planner: candidate groups by
  Audience × category, with target-year filter, successor/apprentice, meeting
  time, status, and the 5-criterion readiness chips. The working view, so it is
  the landing tab. Re-homed from the (still-frozen) Planning › Multiplication tab.
- **Readiness** — the per-cell category × top-type grid (ADR 0019/0021): the
  at-a-glance "which cells are ready to multiply" signal. Unchanged. Setup stays
  in Settings (Groups + Multiply sub-tabs).
- **Leaders** — the apprentice pipeline (Identified → In training → Ready to lead
  → Launched): the supply side of multiplication. Re-homed from the off-nav
  `/admin/leader-pipeline` route.

The tabs share the same **Audience × category cell** axis (`segmentLabel`), so a
Readiness-grid cell deep-links to its segment in the Plan tab, and a candidate's
linked apprentice links to the Leaders tab — recreating the
`CAPACITY_AND_MULTIPLICATION_PRD.md` §7 thread under one surface.

## Julian-fed member count

Consistent with the ADR-0016/0019 pivot — where headcounts/capacity are Julian's
to feed, not derived from in-app memberships — each candidate gains an additive,
nullable `manual_member_count`. When set, it is the effective count the planner
displays **and** the value the "12+ members" readiness criterion reads, overriding
the in-app roster count. Null falls back to the roster count, so seeded
candidates aren't shown as "0 members" until Julian backfills them. The Readiness
grid's Capacity pillar is already Julian-fed and is unchanged.

## What stays as-is

- The Planning area (`/admin/planning`) and `/admin/leader-pipeline` route stay
  **frozen / off-nav** and still resolve by direct URL (ADR 0008/0009/0016). The
  planner and pipeline are now _also_ rendered inside Multiply; both hosts call
  the same components and audited write actions, which revalidate `/admin/multiply`.
- Settings keeps ownership of the grid's setup (group types, targets, and the
  multiplication trigger).
- The candidate/pipeline tables, RPCs, and seed (ADR 0006) are unchanged beyond
  the additive `manual_member_count`.

## Consequences

- A fourth area is **not** added — this stays within the Multiply area, so the
  ADR-0010 surface budget is untouched.
- The `multiplication-planner` is now rendered from two hosts (frozen Planning and
  visible Multiply). That is intentional and safe; the write actions revalidate
  both paths.
- The "launch from scratch" interest lists and the seasonal launch forecast remain
  out of scope (deferred per ADR 0006 / the Capacity & Multiplication PRD).
