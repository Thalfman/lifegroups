---
type: Decision
title: Architecture Decisions (ADR Index)
description: The load-bearing decisions an agent must respect — the pivot, the write/read seams, the privacy model, and multiplication design.
resource: repo://docs/adr
tags: [adr, decisions, architecture, pivot, security]
timestamp: 2026-06-18T00:00:00Z
---

# Purpose

The repo keeps a full ADR record (`docs/adr/0001`→`0027`). This file surfaces
the decisions most likely to bite an agent that doesn't know them. Read the
source ADR before changing the area it governs.

# Source of truth

`docs/adr/*.md` (numbered 0001–0027). Confirmed from filenames + README/CLAUDE
cross-references.

# Key details — decisions that shape the code

## The 2026-06 pivot

- **0016 — Pivot to Care · Plan · Multiply.** The navigation spine. Pre-pivot
  surfaces are hidden behind flags, not deleted.
- **0017 — Reopen Leader/OS logins + Care Notes.** Over-shepherds and leaders
  log in to scoped Care surfaces.
- **0020 — Leader Care Note is group-scoped.** Amends 0017.
- **0022 (two files)** — `multiply-unifies-plan-readiness-leaders` (Multiply
  hosts Plan/Readiness/Leaders tabs) and `admin-jsonb-write-reguard-and-audit-locks`.
- **0023 — All-notes feed + admin authorship.** Care aggregate Notes tab.
- **0024 — Default-on leader surface + Groups/People nav.**
- **0027 — Home is a self-dismissing setup workspace.**

## Write/read architecture

- **0001 — Admin Write Action Runner.** The shared validate→guard→RPC→
  revalidate→log pipeline.
- **0005 — Centralized write validation.**
- **0012 — Cluster validators behind a barrel.**
- **0011 — Group row assembly stays per-surface.**
- **0015 — Reads seam for surface orchestration.** Enables in-memory test
  adapters.
- **0026 — Flag reads stay per-tier.**

## Security & privacy

- **0002 — Oversight ladder + leader gating.** The downward-visibility model.
- **0003 — Private Care Note encryption.** Zero-knowledge, hidden even from
  Super Admin.
- **0009 — Runtime flags may re-enable frozen surfaces.** Verify-before-flip.
- **0014 — Super-Admin permanent deletion.** Tombstone + danger zone.
- **0025 — Invitee chooses own name** (`full_name_pending`).

## Health & multiplication

- **0007 — Group health ships with placeholder labels.**
- **0018 — Configurable A–F health rubrics.**
- **0019 — Multiplication by type and pillars.**
- **0021 — Three-tier multiplication trigger** (global → per-type → per-cell
  cascade; amends the per-cell-only model).
- **0006 — Multiplication planner supersedes Google Doc.**

## Superseded / historical (inferred from cross-refs)

- **0013 — Six-area navigation spine** (pre-pivot; superseded by 0016).
- **0010 — Surface budget**, **0008 — Leader rename labels/glossary**,
  **0004 — Systems-conversation architecture** (pre-pivot mapping of Q1–Q12).

# Relationships

- [/okf/architecture/system-overview.md](/okf/architecture/system-overview.md)
- [/okf/architecture/request-lifecycle.md](/okf/architecture/request-lifecycle.md)
- [/okf/data/index.md](/okf/data/index.md)
- [/okf/auth/auth-overview.md](/okf/auth/auth-overview.md)
- [/okf/glossary/index.md](/okf/glossary/index.md)

# Gotchas

- ADR numbers are not strictly chronological in effect — **two** files share
  number 0022. Read by filename, not number alone.
- "Frozen, not deleted" (0009/0016) is a recurring trap: code for retired
  surfaces still exists and resolves.

# Citations

- `docs/adr/0016-pivot-to-care-plan-multiply.md`
- `docs/adr/0001-admin-write-action-runner.md`
- `docs/adr/0015-reads-seam-for-surface-orchestration.md`
- `docs/adr/0021-three-tier-multiplication-trigger.md`
