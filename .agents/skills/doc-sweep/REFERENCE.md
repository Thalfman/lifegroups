# Doc Sweep — Reference

Tier model, staleness taxonomy, breakdown schema, and report template. Read this
before writing the report.

## Tier model (audit in this order)

Authority cascades downward — a contradiction in a higher tier invalidates the
docs that lean on it, so always resolve the top first.

| Tier | Examples | What to check |
| --- | --- | --- |
| 0 — Root canonical | `README.md`, `CLAUDE.md`, `AGENTS.md`, `CONTEXT.md` (glossary) | Match current architecture, routes, roles, invariants, and vocabulary. These define truth for everything below. |
| 1 — Index | `docs/README.md` and any nav/TOC | Does it list every doc that exists? List docs that don't exist? Point to the right canonical files? (Index-drift) |
| 2 — Decisions | `docs/adr/*` | Supersession chains intact? Any "Accepted" ADR contradicted by a later one or by code? Status fields current? |
| 3 — Specs/plans | `docs/plans/*`, `PRD*.md`, `PRODUCT*.md` | "Not yet built" plans now built (or abandoned)? Duplicate/versioned PRDs for the same area? Which is canonical? |
| 4 — Engineering ref | `docs/architecture/*`, runbooks | Schema/route/command tables match reality? Commands still run? |
| 5 — Ephemeral | `docs/reviews/*`, `retros/*`, audits, point-in-time `*_PLAN`/`*_SWEEP` | Dated artifacts — usually Keep-as-history or Archive; rarely Update. Don't treat a finished review as "stale." |

Tiering is a judgment call from reading, not from the script. Adapt the table to
the repo you're actually in.

## Staleness taxonomy (the verdict)

Assign exactly one primary verdict per doc:

- **Current** — accurate and still load-bearing. No action.
- **Stale** — was true, now partially wrong (old dates, drifted details, "current
  state" written N months ago). Needs a targeted update, not removal.
- **Superseded** — fully replaced by a newer doc/decision. The replacement
  exists; this one lingers.
- **Duplicate / Variant** — overlaps another doc covering the same ground;
  multiple versions piled up. One should be canonical.
- **Contradicted** — makes a claim the current code/schema/routes no longer
  support. Highest-value finding; cite the contradicting code path.
- **Orphaned** — nothing links to it and it's not discoverable from the index;
  or it references deleted files/closed-and-moved-on issues.
- **Index-drift** — the doc is fine but the index mis-lists it (or omits it).

## Recommended actions (what the human will choose)

- **Keep as-is** — current, or valuable point-in-time history.
- **Update** — specify *exactly* what to change (the lines, the claim, the date).
- **Merge into `<canonical>`** — fold unique content into the canonical doc, then
  retire this one.
- **Retire to git history** — `git rm`; recoverable from history. Use when the
  repo's convention favors a lean tree (check CLAUDE.md/docs/README.md).
- **Archive in-tree** — add a `> Superseded by <X> (<date>)` banner and/or move
  under `docs/archive/`. Use when the repo prefers visible tombstones.

Recommend the action that fits the repo's stated retire policy; if none stated,
default to **Archive in-tree** for safety and say so.

## Evidence to gather (deterministic where possible)

- **Git recency:** from `inventory.txt` — last-commit date and age per doc. A doc
  untouched for months while its subject code churned weekly is a Stale signal.
- **Dead links:** from `inventory.txt` — unresolved relative links.
- **Contradiction checks:** Grep the code for the routes/flags/roles/commands a
  doc asserts; if the symbol/route/flag is gone or renamed, it's Contradicted.
- **Supersession:** Grep ADRs for "supersed", "amend", "replaces", "deprecat".
- **Vocabulary drift:** terms used in a doc that conflict with the glossary
  (`CONTEXT.md`) — note both the doc term and the canonical term.
- **Cross-reference orphans:** Grep the repo for the doc's filename; zero inbound
  links + absent from index = Orphaned candidate.

## Per-doc breakdown schema

Every flagged doc (verdict ≠ Current) gets this block. Be comprehensive enough
that the user decides without opening the file:

```md
### `<relative/path.md>`  —  **<Verdict>**
- **Tier:** <0–5>   **Last change:** <date> (<age>)   **Size:** <N> lines
- **Purpose:** <one line — what this doc is for>
- **Finding:** <what's wrong, specifically>
- **Evidence:**
  - <file:line claim> → contradicted by `<code/path:line>` (<what changed>)
  - dead link → `<target>` (does not exist)
  - superseded by `<doc>` (<date / ADR n>)
- **Cost of doing nothing:** <how this misleads a future agent/human>
- **Recommended action:** <Keep | Update | Merge into X | Retire | Archive>
  - <if Update: the precise edits. if Merge: what unique content to carry over.>
- **Confidence:** <High | Medium | Low>   **Reversal risk:** <Low | Med | High>
- **Decision:** ⬜ accept recommendation   ⬜ keep as-is   ⬜ other: ______
```

`Current`-verdict docs don't need a full block — list them in the dashboard so the
user sees they were checked, not skipped.

## Report template

Write to `docs/doc-sweeps/<YYYY-MM-DD-HHMM>/report.md`, with `inventory.txt`
beside it.

```md
# Doc Sweep — <YYYY-MM-DD HH:MM>

Swept <N> markdown docs across <M> directories. Repo retire policy: <quote/none>.
Method: top-down tier audit + code cross-check. Raw inventory: ./inventory.txt

## Dashboard

| Verdict | Count | Docs |
| --- | --- | --- |
| Current | n | … |
| Stale | n | … |
| Superseded | n | … |
| Duplicate/Variant | n | … |
| Contradicted | n | … |
| Orphaned | n | … |
| Index-drift | n | … |

## Top decisions (highest impact first)

1. <one-line recommendation + why it matters most>
2. …

## Decision checklist

- [ ] `<path>` — <recommended action>
- [ ] …

## Per-doc breakdowns

<one schema block per flagged doc, grouped by tier, worst verdicts first>

## Canonical map (after reconciling variants)

| Topic | Canonical doc | Folds in |
| --- | --- | --- |
| <e.g. product spec> | `<doc>` | `<doc>`, `<doc>` |
```

## Scope guardrails

- Exclude `node_modules`, `.git`, build output, and vendored docs (the script
  already does). Don't flag generated files.
- A finished review/retro/audit is **history**, not staleness — Keep-as-is unless
  it's actively misleading.
- When unsure whether something is intentional history vs. drift, mark **Low
  confidence** and surface it as a question rather than a firm recommendation.
