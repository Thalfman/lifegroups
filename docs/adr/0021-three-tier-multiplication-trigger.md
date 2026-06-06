# Three-tier multiplication trigger: global → per-type → per-cell

The Multiplication Trigger (readiness rule) becomes a **three-tier cascade** — a
global rule, an optional **per-type (Audience) rule**, and per-cell overrides — each
level inheriting the level above per pillar unless it overrides. This **amends the
global-plus-per-cell-only model introduced in #402** (which itself recast the
per-type pillar trigger of ADR 0019): Julian wants to set, e.g., Men's interest ≥ 5
while Women's ≥ 3 without overriding every cell. Interest stays a **count, never a
letter**, at every tier.

Status: accepted — amends #402.

## Considered options

- **Global + per-cell only (the #402 status quo).** Rejected: type-wide intent
  ("all Men's cells need more interest") forces an identical override on every cell.
- **Per-type only, no global.** Rejected: loses the single ministry-wide default and
  repeats identical config across the three types.

## Consequences

- A new **per-type rule store** (keyed by ministry year × `audience_category`) sits
  alongside the existing global `multiplication_readiness_rule` and per-cell
  `category_type_targets.trigger_overrides`.
- The readiness evaluator resolves **per pillar**: cell override → per-type → global.
- **Migration is additive:** the existing global rule and per-cell overrides carry
  over unchanged; the per-type tier starts empty (every type inherits the global
  rule), so behaviour is identical until a per-type rule is set.
- The orphaned per-type **letter-grade** `multiplication_config` trigger editor is
  removed — it was no longer read by the Multiply grid (#403) and was the only place
  Interest was a letter. Settings keeps **two** sub-tabs: **Groups** _creates_ group
  types (one cell at a time — pick an Audience, type a free-text category — plus each
  cell's tracking target), and **Multiply** _configures the trigger_ through a tiered
  control (global → per-type → per-cell) over the cells created in Groups.
