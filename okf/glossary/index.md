---
type: Glossary Term
title: Domain Glossary
description: Repo-specific terms an agent must use correctly in code, UX copy, and commits — sourced from CONTEXT.md.
resource: repo://CONTEXT.md
tags: [glossary, domain, vocabulary, terminology]
timestamp: 2026-06-18T00:00:00Z
---

# Purpose

This project enforces precise vocabulary. Using the wrong word (e.g. "Guest" for
"Prospect") is a real defect — `CONTEXT.md` lists `_Avoid_` terms. This is the
condensed reference; defer to `CONTEXT.md` for full definitions.

# Source of truth

- `CONTEXT.md` (the canonical glossary), `README.md` (role model)

# Key details — must-use terms

## Roles (oversight ladder)

- **Super Admin** (Tom) — platform owner; top of ladder. _Avoid:_ owner, root.
- **Ministry Admin** (Julian) — runs the OS day to day; primary persona.
  _Avoid:_ admin (ambiguous), pastor.
- **Over-Shepherd** — coach over a set of Leaders; both coverage data and a
  login tier. _Avoid:_ coach, overseer.
- **Leader / Co-Leader** — the people the ministry cares for; lead a Life Group.
  _Avoid:_ Shepherd, group leader.
- **member** — non-auth participant record; **never logs in**.

## Care

- **Care Note** — author-private pastoral note written _down_ the ladder; sealed
  to author unless Ministry Admin flips that subject's transparency toggle.
- **Private Care Note** — Ministry Admin's _own_ note, encrypted, hidden even
  from Super Admin. Distinct from Care Note.
- **Prayer Request** — author-private prayer record; separate list from Care
  Notes; can be "answered".

## Deletion

- **Archive** — the default reversible soft-delete; the user-facing label for
  taking something/someone out of active use. _Avoid:_ delete, deactivate (UI).
- **Permanent deletion** — Super-Admin-only physical removal; writes a tombstone.
- **Tombstone** — full JSON snapshot captured before permanent deletion.

## Groups & cells

- **Audience** — Men / Women / Mixed (`audience_category`).
- **Category** — free-form bracket from `group_categories` (e.g. "20-30s").
  Replaced the retired `life_stage` enum. No category → **Uncategorized**.
- **Cell** — one `category_type_targets` row = Audience × Category; carries
  target, coverage, capacity, health, readiness. Resolved by `resolveCell`.
- **Segment** — internal-only umbrella for the cell bucket; not shown to users.
- **Cell coordinate / `cellKey`** — the canonical `audience:categoryId` map key.

## Interest funnel (Plan)

- **Interest Funnel** — the Plan area; replaces the Guests pipeline.
- **Prospect** — a person interested in joining (distinct from the _Interested_
  state). _Avoid:_ guest, lead.
- **Prospect states** — Interested (yellow) → Matched (blue) → Joined (green,
  archived) / Not at this time (orange).

## Health (four distinct ideas)

- **Group-Health Grade** / **Leader-Health Grade** — A–F letters from
  configurable rubrics, tracked within the **Ministry Year** (Aug–May).
- **Health Rubric** / **Leader-Health Rubric** — Julian-owned weighted criteria
  totalling 100.
- **Leader Care Status** — pastoral "is there an issue / next step" signal.
- **Health Pulse** — a Leader's own weekly self-report (not the grade).

## Multiplication (Multiply)

- **Multiplication** — deciding when to launch another group; assessed per cell.
- **Multiplication Pillar** — readiness signal per cell in its natural unit:
  Interest (count), Capacity (issue/no-issue), Group/Leader Health (A–F).
- **Derived Capacity** — capacity is derived (cap 12/group), not fed.
- **Multiplication Trigger** — Julian's readiness rule; three-tier cascade
  global → per-type → per-cell (ADR 0021).
- **Target & Coverage** — `have X of Y`; tracking only, never feeds the trigger.

## Surfaces

- **Home Hub**, **Admin OS** (labelled "Ministry Admin" in UI), **Settings**
  (ministry/pastoral config), **Super Admin Console** (platform/feature flags).

# Relationships

- [/okf/data/index.md](/okf/data/index.md)
- [/okf/auth/auth-overview.md](/okf/auth/auth-overview.md)
- [/okf/decisions/index.md](/okf/decisions/index.md)
- [/okf/routes/index.md](/okf/routes/index.md)

# Gotchas

- "Multiply" is overloaded: the _area_ reads the readiness signal; the Settings
  _Multiply sub-tab_ configures it.
- "Ministry Admin" names both the _role_ and the _surface_.
- Several terms map to retired schema (`guests`, `life_stage`,
  `multiplication_config`) — use the live term, but expect the old column/table
  to still exist.

# Citations

- `CONTEXT.md:1-358`
- `README.md:93-135`
