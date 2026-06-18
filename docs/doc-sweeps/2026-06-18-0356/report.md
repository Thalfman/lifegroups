# Doc Sweep — 2026-06-18 03:56

Swept **88** markdown docs across the root, `docs/`, `docs/adr/`,
`docs/plans/`, `docs/architecture/`, `docs/runbooks/`, `docs/reviews/`,
`docs/retros/`, `docs/store/`, `docs/julian-inputs/`, and `supabase/dev/`. Repo
retire policy: *"historical docs are retired to git history"* (CLAUDE.md,
docs/README.md). Method: top-down tier audit + code cross-check. Raw inventory:
[`./inventory.txt`](./inventory.txt) (0 dead relative links).

Headline: the **root canon and engineering reference are in strong shape** (most
architecture/runbook docs were refreshed 2–4h before the sweep). Drift is
concentrated in **(a) an ADR numbering collision**, **(b) the documentation
index undercounting/omitting docs**, and **(c) a handful of stale specifics** in
otherwise-current root docs.

## Dashboard

| Verdict | Count | Docs |
| --- | --- | --- |
| Current | 73 | Root: CLAUDE.md, README.md*, AGENTS.md, PRODUCT.md, DESIGN.md. All `docs/architecture/*` (8), all `docs/runbooks/*` (9), `docs/store/*` (2), `supabase/dev/README.md`, `docs/PRODUCT_DEFINITION.md`, `docs/design-direction.md`, `docs/ui-followups.md`, `docs/julian-inputs/*` (5), ADRs 0001–0007, 0011, 0012, 0014, 0015, 0021, 0022(multiply), 0026, 0027, and the well-labeled proposal plans (FRESH_SLATE, REPO_CONSOLIDATION, CONCEPT_RECONCILIATION, SHEPHERD_CARE_TRACKER). (*README has one stale line — see below.) |
| Stale | 4 | `CONTEXT.md`, `README.md`, `docs/README.md`, `docs/plans/CAPACITY_AND_MULTIPLICATION_PRD.md` |
| Superseded | 1 | `docs/PRD.md` (self-labeled) |
| Duplicate/Variant | 1 | `docs/adr/0022-admin-jsonb-write-reguard-and-audit-locks.md` (number collision) |
| Contradicted | 1 | `CONTEXT.md` "Admin OS" entry (also counted under Stale) |
| Orphaned | 3 | `docs/plans/HOME_CARE_SETTINGS_FINISH_LINE_PLAN.md`, `docs/plans/SETTINGS_GROUPS_AND_TRIGGERS_PRD.md`, `docs/plans/ADMIN_INTERACTION_MODEL_PRD.md` |
| Index-drift | 1 | `docs/README.md` (omits ~12 docs; undercounts ADRs) |
| Keep-as-history (ephemeral, checked) | 13 | `docs/reviews/*` (8), `docs/retros/*` (2), `docs/REPO_SWEEP_PLAN.md`, `docs/ui-audit.md`, `docs/MOBILE_STORE_ROADMAP.md` |

## Top decisions (highest impact first)

1. **Resolve the ADR 0022 collision.** Two `0022-*` ADRs both exist and are
   "Accepted". Renumber `0022-admin-jsonb-write-reguard-and-audit-locks.md` →
   `0028-…` (the multiply-unifies 0022 is the one cited by CLAUDE.md/README/index
   and belongs in the 0016–0022 pivot run). Highest-confidence, highest-clarity
   fix.
2. **Fix `CONTEXT.md` "Admin OS" entry** (lines 326–327): it says Groups/People
   tabs are "hidden behind nav-visibility flags, default off," but **ADR 0024**
   seeded them **on** (README:42-45, ADR 0024). A glossary the repo mandates as
   the vocabulary source must not contradict a landed ADR.
3. **Reconcile the documentation index** (`docs/README.md`): line 70 claims
   "ADRs 0001–0025" while 0001–0027 + a dual-0022 exist, and ~12 real docs
   (2 plans, 8 reviews, 2 retros, design-direction, EMAIL_DELIVERY, 2 runbooks,
   ui-audit/followups, REPO_SWEEP_PLAN, MOBILE_STORE_ROADMAP) are absent. Also
   line 49 cites ADR 0007 placeholder labels where **ADR 0018** shipped a
   configurable rubric.
4. **Two small stale specifics in `README.md`:** the Edge Functions list (line
   177) omits `redeem-invite` (it exists in `supabase/functions/`; CLAUDE.md:128
   already lists all three).
5. **Decide `docs/PRD.md`'s fate.** It self-declares Superseded by the pivot;
   under the repo's git-history retire policy it's a retire candidate — or keep
   in-tree as the deliberate Q1–Q12 historical record (README/index both point to
   it on purpose). User's call.

## Decision checklist

- [ ] `docs/adr/0022-admin-jsonb-write-reguard-and-audit-locks.md` → **renumber to 0028** (update any inbound links; none found in CLAUDE.md/README/index)
- [ ] `CONTEXT.md` → **update** "Admin OS" entry to reflect ADR 0024 (Groups/People default-on)
- [ ] `docs/README.md` → **update** ADR range to 0001–0027 (+ note dual 0022); add 0026/0027
- [ ] `docs/README.md` → **update** index to list the ~12 omitted docs (new "Reviews & retros" section; add 2 plans, EMAIL_DELIVERY, 2 runbooks)
- [ ] `docs/README.md` line 49 → **update** GROUP_HEALTH_RUBRIC citation from ADR 0007 placeholders to ADR 0018 configurable rubric
- [ ] `README.md` line 177 → **update** Edge Functions list to add `redeem-invite`
- [ ] `docs/PRD.md` → **decide:** retire to git history (policy default) vs keep as deliberate historical record
- [ ] `docs/plans/CAPACITY_AND_MULTIPLICATION_PRD.md` → **update** header to cite ADR 0019/0021/0022 as the delivered shape
- [ ] `docs/plans/ADMIN_INTERACTION_MODEL_PRD.md` → **clarify** status + relationship to HOME_CARE_SETTINGS_FINISH_LINE_PLAN
- [ ] ADRs 0008/0009/0010/0013/0016/0017/0018/0019/0020/0023/0024/0025 → **add `Status:` headers** for consistency (0013 should note "amended by 0016")
- [ ] Ephemeral docs (reviews/retros/REPO_SWEEP_PLAN/ui-audit/MOBILE_STORE_ROADMAP) → **keep as-is** (history / live tracking)

## Per-doc breakdowns

### `docs/adr/0022-admin-jsonb-write-reguard-and-audit-locks.md` — **Duplicate / number collision**
- **Tier:** 2  **Last change:** 2026-06-14 (4 days)  **Size:** 137 lines
- **Purpose:** Records the JSONB-write re-guard + audit-lock RPC hardening decision.
- **Finding:** Shares ADR number 0022 with `0022-multiply-unifies-plan-readiness-leaders.md`. Both are `Status: accepted`.
- **Evidence:**
  - Two files `docs/adr/0022-*.md` (inventory).
  - CLAUDE.md:223, README:16, docs/README.md cite "0022" = the **multiply-unifies** ADR; the jsonb-write ADR is cited nowhere.
- **Cost of doing nothing:** "ADR 0022" is ambiguous; cross-references and the supersession trail are unreliable.
- **Recommended action:** **Renumber** the jsonb-write ADR to `0028-admin-jsonb-write-reguard-and-audit-locks.md` (the multiply-unifies 0022 stays — it belongs in the 0016–0022 pivot sequence and is the cited one).
- **Confidence:** High  **Reversal risk:** Low
- **Decision:** ⬜ accept  ⬜ keep as-is  ⬜ other: ______

### `CONTEXT.md` — **Stale / Contradicted**
- **Tier:** 0 (glossary — mandated vocabulary source)  **Last change:** 2026-06-17 (7h)  **Size:** 357 lines
- **Purpose:** The domain glossary; repo requires its vocabulary in code/UX/commits.
- **Finding:** The **"Admin OS"** entry says the post-pivot tabs are "Home · Care · Plan · Multiply · Settings" and that "the former Groups, Planning, People, Calendar, and Follow-ups tabs are hidden behind Super-Admin nav-visibility flags, default off." **ADR 0024** moved **Groups** and **People** back into the nav, seeded **on**.
- **Evidence:**
  - `CONTEXT.md:326-327` (Groups/People listed as hidden/default-off) → contradicted by `README.md:42-45`, ADR `docs/adr/0024-default-on-leader-surface-and-groups-people-nav.md`, and the live route table in README:142-148.
- **Cost of doing nothing:** The authoritative glossary contradicts a landed ADR; an agent trusting CONTEXT.md would wrongly treat Groups/People as off-by-default.
- **Recommended action:** **Update** the "Admin OS" entry to list Groups + People as default-on (ADR 0024) and keep only the genuinely off-nav surfaces (Planning, Calendar, Follow-ups) in the hidden list.
- **Confidence:** High  **Reversal risk:** Low
- **Decision:** ⬜ accept  ⬜ keep as-is  ⬜ other: ______

### `docs/README.md` — **Index-drift / Stale**
- **Tier:** 1 (index)  **Last change:** 2026-06-18 (2h)  **Size:** 80 lines
- **Purpose:** The documentation index / nav.
- **Finding:** (a) Line 70 says "ADRs 0001–0025"; actual set is 0001–0027 **plus** a dual-0022. (b) ~12 existing docs are unlisted. (c) Line 49 cites ADR 0007 placeholder labels for the group-health rubric, but ADR 0018 shipped the configurable rubric.
- **Evidence:**
  - `docs/README.md:70` "(0001–0025 … amended by 0023–0024)" → `docs/adr/0026-*.md`, `0027-*.md` exist; two `0022-*` files exist.
  - Unlisted: `docs/plans/HOME_CARE_SETTINGS_FINISH_LINE_PLAN.md`, `docs/plans/SETTINGS_GROUPS_AND_TRIGGERS_PRD.md`, `docs/reviews/*` (8), `docs/retros/*` (2), `docs/design-direction.md`, `docs/architecture/EMAIL_DELIVERY.md`, `docs/runbooks/care-notes-visibility-setup.md`, `docs/runbooks/rls-integration-harness.md`, `docs/ui-audit.md`, `docs/ui-followups.md`, `docs/REPO_SWEEP_PLAN.md`, `docs/MOBILE_STORE_ROADMAP.md`.
  - `docs/README.md:49` cites ADR 0007 placeholders → superseded by `docs/adr/0018-configurable-af-health-rubrics.md`.
- **Cost of doing nothing:** The index is the discovery surface; omitted docs are effectively orphaned, and the ADR count misleads on what decisions exist.
- **Recommended action:** **Update** — bump ADR range to 0001–0027 (note dual 0022); add the omitted docs (a "Reviews & retros" section for the ephemeral ones; the 2 plans into the plans table; EMAIL_DELIVERY + 2 runbooks into engineering ref); fix line 49 to ADR 0018.
- **Confidence:** High  **Reversal risk:** Low
- **Decision:** ⬜ accept  ⬜ keep as-is  ⬜ other: ______

### `README.md` — **Stale (minor specifics)**
- **Tier:** 0  **Last change:** 2026-06-14 (3 days)  **Size:** 252 lines
- **Purpose:** Root canonical: what the app is, roles, routes, security posture.
- **Finding:** Security posture (line 177) lists only `invite-user`, `manage-test-auth-users` as Edge Functions; `redeem-invite` exists too.
- **Evidence:**
  - `README.md:176-177` → `supabase/functions/redeem-invite/` exists; `CLAUDE.md:128` already lists all three.
- **Cost of doing nothing:** Minor; understated security surface inventory.
- **Recommended action:** **Update** line 177 to add `redeem-invite`. (Everything else in README — routes, role ladder, leader_surface default-on via migration `20260701020000`, the read-debt-closed claim — verified accurate against code.)
- **Confidence:** High  **Reversal risk:** Low
- **Decision:** ⬜ accept  ⬜ keep as-is  ⬜ other: ______

### `docs/PRD.md` — **Superseded (self-labeled)**
- **Tier:** 3  **Last change:** 2026-06-14 (4 days)  **Size:** 241 lines
- **Purpose:** The original 1:1 PRD mapping Julian's Q1–Q12 to requirements.
- **Finding:** Header (lines 3–6) declares it "Superseded in framing by the Care/Plan/Multiply pivot," kept as historical record. Under the repo's git-history retire policy it's a retire candidate; but README:86 and docs/README.md:22 deliberately point to it as the historical Q1–Q12 trail.
- **Evidence:** `docs/PRD.md:3-6` self-supersession; current spec is ADR 0016 + PRD #371.
- **Cost of doing nothing:** Low — it's correctly labeled. Mild risk an agent treats it as current if they skip the header.
- **Recommended action:** **Decide** — retire to git history (policy default for superseded docs) **or** keep as the intentional historical record. Low urgency.
- **Confidence:** Medium  **Reversal risk:** Med (retiring loses an in-tree historical pointer)
- **Decision:** ⬜ retire to git history  ⬜ keep as-is  ⬜ other: ______

### `docs/plans/CAPACITY_AND_MULTIPLICATION_PRD.md` — **Stale (framing)**
- **Tier:** 3  **Last change:** 2026-06-14 (4 days)  **Size:** 423 lines
- **Purpose:** Capacity + leader-pipeline + multiplication build spec (Q9–Q11).
- **Finding:** Describes the feature as "shipped but missing the mark"; the delivered shape is now defined by ADR 0019/0021/0022 (per-type readiness boards + planner + leader pipeline in Multiply), not this PRD.
- **Evidence:** Plan header/body vs `docs/adr/0019,0021,0022-multiply-*`.
- **Cost of doing nothing:** An agent may read it as the current target shape rather than a design trace.
- **Recommended action:** **Update** header to cite ADR 0019/0021/0022 as definitive and frame the PRD as scope/design trace; mirror in docs/README.md:50.
- **Confidence:** Medium  **Reversal risk:** Low
- **Decision:** ⬜ accept  ⬜ keep as-is  ⬜ other: ______

### `docs/plans/HOME_CARE_SETTINGS_FINISH_LINE_PLAN.md` & `docs/plans/SETTINGS_GROUPS_AND_TRIGGERS_PRD.md` — **Orphaned**
- **Tier:** 3  **Last change:** 2026-06-14 (4 days)  **Size:** 462 / 160 lines
- **Purpose:** Active finish-line plan (Home/Care/Settings, waves #467–#480) and a future Settings overhaul PRD (category_id, per-cell targets, numeric triggers).
- **Finding:** Both exist but neither is listed in the index (docs/README.md:48-54 lists 7 of 9 plans).
- **Evidence:** Absent from `docs/README.md`.
- **Cost of doing nothing:** Live/relevant plans are undiscoverable from the index.
- **Recommended action:** **Update** index to add both to the plans table.
- **Confidence:** High  **Reversal risk:** Low
- **Decision:** ⬜ accept  ⬜ keep as-is  ⬜ other: ______

### `docs/plans/ADMIN_INTERACTION_MODEL_PRD.md` — **Orphaned / ambiguous status**
- **Tier:** 3  **Last change:** 2026-06-14 (4 days)  **Size:** 247 lines
- **Purpose:** Admin interaction model (progressive disclosure, density, list-to-detail editing across /admin).
- **Finding:** No `Status:` field; scope overlaps the (unindexed) HOME_CARE_SETTINGS_FINISH_LINE_PLAN; no code/issue trail establishing built vs proposed.
- **Evidence:** Listed in index (line 51) but with no status; overlap with HOME_CARE_SETTINGS finish-line scope.
- **Cost of doing nothing:** Unclear whether it's a live design, superseded, or done.
- **Recommended action:** **Clarify** — add a Status field and note its relationship to HOME_CARE_SETTINGS_FINISH_LINE_PLAN (design → finish-line work).
- **Confidence:** Medium  **Reversal risk:** Low
- **Decision:** ⬜ accept  ⬜ keep as-is  ⬜ other: ______

### ADRs missing `Status:` headers — **Consistency (not staleness)**
- **Tier:** 2  **Docs:** 0008, 0009, 0010, 0013, 0016, 0017, 0018, 0019, 0020, 0023, 0024, 0025
- **Finding:** These lack an explicit `Status:` line that 0001/0006/0007/0011/0012/0014/0015/0026/0027 carry. Supersession chains themselves are valid (0005→0012, 0013→0016, 0019→0021, 0017→0020 all documented). 0013 in particular should record "amended by 0016".
- **Cost of doing nothing:** Low; cosmetic inconsistency, but 0013's missing "amended by 0016" can mislead on the nav model.
- **Recommended action:** **Update** — add `Status: Accepted` (or `Accepted — amends <ADR>`) headers; add "amended by 0016" to 0013.
- **Confidence:** High  **Reversal risk:** Low
- **Decision:** ⬜ accept  ⬜ keep as-is  ⬜ other: ______

### Ephemeral docs — **Keep as history (checked, not flagged)**
- `docs/reviews/*` (8: architecture-deepening, coding-standards, phase-1..6) — finished point-in-time reviews. **Keep.**
- `docs/retros/*` (2: admin-im-04/05 group-health) — finished post-impl retros (#259/#260). **Keep.**
- `docs/REPO_SWEEP_PLAN.md` — live multi-phase roadmap with resolved open questions. **Keep as live tracking.**
- `docs/ui-audit.md` → `docs/design-direction.md` → `docs/ui-followups.md` — coherent audit→direction→followups chain; all current/complementary. **Keep.**
- `docs/MOBILE_STORE_ROADMAP.md` — draft future roadmap (Phase 0 mostly unchecked); aspirational, not contradicted. **Keep.**

## Canonical map (after reconciling variants)

| Topic | Canonical doc | Folds in / relationship |
| --- | --- | --- |
| Product / end-state spec | `docs/PRODUCT_DEFINITION.md` | `docs/PRD.md` (historical Q1–Q12); root `PRODUCT.md` is brand register (complementary, not a dup) |
| Brand & voice | `PRODUCT.md` (root) | — |
| Design system tokens | `DESIGN.md` (root) | `docs/design-direction.md` = forward Phase-2 proposal (complementary) |
| Domain glossary | `CONTEXT.md` | — (needs the Admin OS fix) |
| Decisions | `docs/adr/*` | resolve dual-0022 by renumbering jsonb-write → 0028 |
| Multiplication delivered shape | ADR 0019/0021/0022 | `docs/plans/CAPACITY_AND_MULTIPLICATION_PRD.md` = design trace |

---

*Generated by the `doc-sweep` skill — report-only; no existing docs were edited.
Mark the decision checklist above and a follow-up pass can execute the chosen
fixes.*
