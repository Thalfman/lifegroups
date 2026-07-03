# Collapse the Cell (Audience × Category) model to a free-text Group-Type list

**Status:** Accepted — written retroactively on 2026-07-03 to record a change
already shipped in #738 (migration `20260708000000_collapse_cells_to_group_type_list.sql`;
the decision itself was ratified when that PR merged). Supersedes the
Audience-as-unit model of [ADR 0019](./0019-multiplication-by-type-and-pillars.md)
and the three-tier trigger cascade of
[ADR 0021](./0021-three-tier-multiplication-trigger.md); later amended by
[ADR 0030](./0030-multiply-readiness-first-and-type-intent-pipeline.md)
(the `in_pipeline` type-intent flag).

The groups overhaul modelled a group's segmentation as a **Cell** = Audience
(men / women / mixed) × Category (a free-form label catalog), with per-cell
config (target counts, trigger overrides) and a three-tier readiness cascade
(global → per-audience → per-cell). The ministry wanted maximum flexibility
instead of that fixed 2-D grid, so the model collapsed to a single free-text
**Group type** per group.

> **Why retroactive?** The collapse was recorded only in the migration header
> and a passing reference in ADR 0030, leaving ADR 0019/0021 reading as
> current — a broken supersession chain the 2026-07-03 audit identified as the
> root of the glossary drift (findings DOC-1/3/4/11). This ADR restores the
> chain; it introduces no new decision.

## Decision

- **A group's type is a single free-text string** (`groups.group_type`,
  nullable — `null` reads as **Untyped**, a visible bucket so untyped groups
  are never lost), chosen from an **admin-managed list** stored in the
  `app_settings` `group_types` row and edited in Settings › Groups. The
  ministry names types whatever it wants (e.g. "Men's", "Young families").
- **Audience is removed entirely.** The Audience × Category grid, the
  `group_categories` catalog, and every per-cell coordinate are retired.
- **Per-type config moves to `group_type_configs`** — one row per type name,
  carrying the tracking `target_count` and an optional `readiness_rule` jsonb
  override (`null` = inherit the global rule). ADR 0030 later added the
  `in_pipeline` intent flag to this table (`20260712000000`).
- **The trigger cascade shrinks from three tiers to two:** global
  (`multiplication_readiness_rule`, kept) → per-type override
  (`group_type_configs.readiness_rule`). The per-cell override store
  (`category_type_targets.trigger_overrides`) and the per-audience tier are
  gone.
- **Multiplication candidates always anchor to a concrete group.** Type-only
  candidate rows were soft-archived by the migration. (ADR 0030 deliberately
  and partially reverses the _intent_ side of this — a type can sit in the
  Pipeline with no candidate — but as a flag on the per-type config, not by
  resurrecting type-only candidate rows.)
- **Prospects carry a Desired group type** (free text from the same list)
  instead of a desired audience/category pair.

## What was dropped

Migration `20260708000000` (an authorized destructive schema change — the
no-hard-delete invariant governs app workflows, not one-time schema
migrations) dropped:

- Tables: `category_type_targets`, `audience_readiness_rule`,
  `multiplication_config`, `group_categories`.
- Columns: `groups.audience_category`, `groups.category_id`,
  `prospects.desired_audience_category`, `prospects.desired_category_id`,
  `multiplication_candidates.audience_category`,
  `multiplication_candidates.category_id`.
- The cell-parameterized RPC overloads (`admin_create_group`,
  `admin_update_group`, `admin_create_prospect`,
  `admin_create_multiplication_candidate`,
  `admin_update_multiplication_candidate` were recreated without cell
  params; the per-cell config RPCs were replaced by `admin_set_group_types`
  and `admin_set_group_type_config`).

## What ADR 0019 keeps

The five **pillars**, the directional trigger rubric, and "no single overall
multiplication letter" survive unchanged — only the **unit** changed, from the
Audience board to the group type. ADR 0021's insight (type-wide intent should
not require per-unit overrides) also survives, simplified: the per-type
override _is_ the only override tier now.

## Consequences

- CONTEXT.md's **Group type** entry is the canonical glossary description;
  "Cell", "Audience", and "Category" are retired vocabulary (historical docs
  only).
- Internal identifiers that predate the collapse (e.g.
  `lib/admin/cell-readiness.ts`) keep their names until those modules are
  next touched — mirroring the ADR 0025 rule that code identity may lag
  user-facing vocabulary.
- Readiness, coverage ("have X of Y"), and the Multiply grid are all keyed by
  the free-text type name; renaming a type in Settings is a data operation on
  the list plus its config row, not a schema concern.
