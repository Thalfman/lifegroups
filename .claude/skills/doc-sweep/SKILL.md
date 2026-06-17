---
name: doc-sweep
description: Audit a repo's documentation top-down and produce a timestamped report that flags stale, superseded, duplicated, contradicted, and orphaned docs — each with a comprehensive breakdown and a recommended keep/update/merge/retire decision. Never edits or removes docs on its own. Use when docs have drifted after several sessions, versions of PRDs/ADRs/plans have piled up, or the user asks to "clean up the docs", "bring docs up to speed", "audit documentation", or "do a doc sweep".
---

# Doc Sweep

Bring a repo's documentation back up to speed after many sessions of drift.
You **diagnose and recommend**; you do **not** edit, move, or delete docs.
The deliverable is a timestamped report the user can act on later.

## Golden rules

- **Report only.** Make zero changes to existing docs. The only file you create
  is the report (and its inventory) under a new timestamped subdirectory.
- **Top-down.** Audit highest-authority docs first; their truth cascades down.
- **Flag, never decide.** Every candidate gets a full breakdown (§Breakdown in
  [REFERENCE.md](REFERENCE.md)) so the human can decide each one in seconds.
- **Evidence over opinion.** Cite the file:line, the contradicting code path, the
  superseding doc, the dead link, or the git date — not a vibe.

## Workflow

1. **Discover conventions.** Read the repo's own rules first so the sweep matches
   how *this* repo treats docs: `CLAUDE.md`, `AGENTS.md`, `README.md`,
   `CONTEXT.md` (glossary), and any docs index (`docs/README.md`). Note its
   retire policy (e.g. "historical docs are retired to git history").
2. **Inventory.** Run `scripts/doc-inventory.sh` from the repo root. It lists
   every markdown file with its last-commit date/age and line count, and scans
   for dead relative links. Save its raw output as `inventory.txt` in the report
   dir. This is your factual spine — don't eyeball file lists.
3. **Tier the docs.** Classify into tiers (root canonical → index → ADRs →
   PRDs/plans → runbooks/architecture → ephemeral reviews/retros/audits). See
   [REFERENCE.md](REFERENCE.md) for the tier model.
4. **Audit top-down, tier by tier.** For each doc apply the staleness taxonomy
   (Current / Stale / Superseded / Duplicate / Contradicted / Orphaned /
   Index-drift). Verify claims against current code — routes, flags, roles,
   schema, ADR supersession chains — using Grep/Read. A claim a doc makes that
   the code no longer supports is the highest-value finding.
5. **Reconcile variants.** Where several docs cover the same ground (multiple
   PRDs, `PRD.md` vs `PRODUCT.md`, README vs CLAUDE.md vocabulary), name the
   canonical one and recommend how the others fold in.
6. **Write the report** to a NEW subdirectory `docs/doc-sweeps/<YYYY-MM-DD-HHMM>/`
   (create `docs/doc-sweeps/` if absent; if the repo has a different reviews
   home, mirror it). Use the report template in [REFERENCE.md](REFERENCE.md):
   summary dashboard → decision checklist → per-doc breakdowns.
7. **Hand off.** Reply with the report path, the dashboard counts, and the 3–5
   highest-impact decisions. Offer to execute the user's decisions in a follow-up
   pass once they've marked the checklist.

## What "good" looks like

- Every flagged doc has: verdict, evidence, recommended action, the *cost of
  doing nothing*, and a one-line default decision.
- The report is skimmable in 2 minutes (dashboard + checklist) and exhaustive on
  demand (per-doc breakdowns below).
- Nothing in the repo changed except the new report directory.

## Reference

Tier model, staleness taxonomy, the per-doc breakdown schema, and the full report
template live in [REFERENCE.md](REFERENCE.md). Read it before writing the report.
