# Desloppify Review Backlog

Review date: 2026-06-21

Scope: local static scan of the LifeGroups repo, with emphasis on rushed implementation, duplicated logic, naming drift, fragile assumptions, missing coverage, UI/UX rough edges, security/validation risk, dead/stale artifacts, and architectural confusion.

Notes:

- No source code was changed for this review.
- The current security fitness suite already covers several historical high-risk findings, including service-role leakage, `select("*")`, direct table writes, hard deletes, broad RLS, action-adapter routing, hardcoded identities, and Care Note TS/SQL visibility drift. Those are not repeated here as open items unless the scan found a current gap around them.
- This backlog is meant to be selected one item at a time. After a task is completed, display this backlog again with the completed item marked off.

## 1. Critical Issues

No current critical code issue was found in this scan.

The main caveat is external configuration: the repo contains strong CI/RLS workflows, but local files alone cannot prove which GitHub branch-protection checks are required. That is tracked below as a medium operational cleanup item rather than a code-critical issue.

## 2. Medium Cleanup Items

### [ ] M1. Finish the Multiply "Cell" to "Group Type" cleanup

Where:

- `app/(protected)/admin/multiply/page.tsx:166` still renders user-facing copy: "which cells are ready".
- `app/(protected)/admin/multiply/page.tsx:23-24` still describes the page as a per-cell grid in comments.
- `lib/dashboard/types.ts:257-262` exposes `readyCells` and `activeCells`.
- `lib/dashboard/fallback-data.ts:109-120` still describes "Cells ready to multiply".
- `components/lg/admin/dashboard/MultiplyOverviewCard.tsx:15-16` and `components/lg/admin/dashboard/VitalSignsBand.tsx:17-18` retain "cells" comments.
- `docs/PRODUCT_DEFINITION.md:243`, `docs/PRODUCT_DEFINITION.md:281-285`, and `docs/PRODUCT_DEFINITION.md:432` still describe the product in Cell terms.

Why it matters:

The repo has moved to group-type language, and the current `CONTEXT.md` says retired Cell language should not shape the user-facing model. One live copy string plus old DTO names and stale docs will keep reintroducing the old concept.

Recommended change:

- Fix the live page copy first: "which group types are ready" or similar.
- Update comments and product docs to either use group-type language or explicitly mark Cell language as retired historical context.
- Treat the `readyCells` / `activeCells` field rename as a separate, focused compatibility-safe change. Rename to `readyGroupTypes` / `activeGroupTypes` only if all imports, tests, and serialized assumptions are updated together.

Safe now or wait:

- Safe now for user copy, comments, and docs.
- Wait or isolate the DTO field rename, because it touches shared dashboard contracts.

### [ ] M2. Split the remaining oversized modules along existing seams

Where:

- `lib/supabase/shepherd-care-reads.ts` is about 1123 lines.
- `lib/dashboard/queries.ts` is about 806 lines.
- `lib/dashboard/admin-group-model.ts` is about 803 lines.
- `lib/admin/permanent-deletion.ts` is about 780 lines.
- `lib/admin/check-ins.ts` is about 771 lines.
- `app/(protected)/admin/groups/[groupId]/page.tsx` is about 709 lines.
- `components/admin/multiplication/multiplication-planner.tsx` is about 686 lines.
- `components/admin/groups-directory.tsx` is about 685 lines.
- `components/admin/people-directory.tsx` is about 668 lines.
- `app/(protected)/admin/shepherd-care/actions.ts` is about 668 lines.

Why it matters:

These files are not automatically bad, but they are now large enough to make reviews, conflict resolution, and agent-assisted edits harder. The risk is accidental behavior drift when a future change touches a large mixed-responsibility file.

Recommended change:

- Split one file family at a time with no behavior changes.
- Prefer already-established local patterns: thin barrels, read-model helpers, route-level orchestration, and focused UI subcomponents.
- Good first candidates are `app/(protected)/admin/groups/[groupId]/page.tsx` or `components/admin/groups-directory.tsx`, because they are visible UI surfaces where smaller components improve reviewability.
- Avoid abstracting the group read models too aggressively. The repo already has ADR guidance warning that group row assembly has intentional differences across surfaces.

Safe now or wait:

- Safe now if done mechanically with tests after each small extraction.
- Wait if there is active feature work in the same files.

### [ ] M3. Build an import-aware action coverage map, then fill the highest-risk gaps

Where:

Action files with no obvious nearby tests include:

- `app/(protected)/admin/follow-ups/actions.ts`
- `app/(protected)/admin/group-health/actions.ts`
- `app/(protected)/admin/group-health/grade-actions.ts`
- `app/(protected)/admin/groups/[groupId]/calendar/actions.ts`
- `app/(protected)/admin/guests/actions.ts`
- `app/(protected)/admin/launch-planning/actions.ts`
- `app/(protected)/admin/launch-planning/scenario-actions.ts`
- `app/(protected)/admin/leader-pipeline/actions.ts`
- `app/(protected)/admin/multiply/actions.ts`
- `app/(protected)/admin/super-admin/*-actions.ts`
- `app/(protected)/leader/[groupId]/calendar/actions.ts`
- `app/(protected)/leader/[groupId]/care/actions.ts`
- `app/(protected)/over-shepherd/[profileId]/actions.ts`
- `app/invite/[token]/actions.ts`

Why it matters:

These files sit on mutation boundaries. The action-adapter fitness checks are good, but they do not prove that each action validates inputs, maps domain errors correctly, revalidates the right paths, or preserves audit behavior.

Recommended change:

- First create an import-aware coverage map so indirectly tested actions are not misclassified.
- Then add focused tests for the highest-risk uncovered actions, especially super-admin danger-zone actions, care actions, invitation redemption, and Multiply/leader-pipeline actions.
- Use existing action tests and RPC tests as templates instead of inventing a new test style.

Safe now or wait:

- Safe now as test-only work.
- Best done before refactoring these action files.

### [ ] M4. Add seeded browser happy paths for the core write flows

Where:

- `.github/workflows/seeded-auth-route-smoke.yml` exists, but it is manual/scheduled.
- `scripts/seeded-auth-route-smoke.sh` runs role-routing, leader-route, and mobile smoke specs.
- `tests/a11y/mobile-smoke.spec.ts` renders key routes but does not submit the main forms.
- `tests/integration/action-pipeline.test.ts` verifies care-note RPC/audit behavior below the UI layer.

Why it matters:

The repo has strong static and integration checks, but a form wiring regression could still slip through: wrong hidden field, stale action import, broken submit button, missing redirect/revalidate, or a post-write visibility issue.

Recommended change:

Add a small opt-in seeded Playwright suite for:

- Creating a care note and confirming it appears where expected.
- Advancing or updating one leader/prospect pipeline state.
- Updating one Multiply readiness/candidate state.

Keep the suite small and deterministic. If possible, verify the resulting DB/audit state, not just the UI toast.

Safe now or wait:

- Wait until selected because it depends on the local seeded Supabase/Playwright workflow and will be slower than unit tests.

### [ ] M5. Verify RLS integration is actually required in branch protection

Where:

- `.github/workflows/rls-integration.yml` runs local Supabase RLS integration checks on matching PR paths, schedule, and manual dispatch.
- The repo files do not prove whether GitHub branch protection requires this workflow.

Why it matters:

The RLS integration lane is the deeper safety net behind the static fitness tests. If it is not a required check for relevant PRs, it can become advisory in practice.

Recommended change:

- Use `gh api` or GitHub settings to inspect required status checks for `main`.
- If missing, require the RLS integration check for matching PRs.
- Document the expected required check names so future workflow renames do not silently weaken protection.

Safe now or wait:

- Wait for explicit selection because this is an external repository-setting verification, not a code edit.

### [ ] M6. Correct the stale Multiply tab-loading comment, then decide whether to lazy-load hidden tabs

Where:

- `app/(protected)/admin/multiply/page.tsx:65-83` loads plan, grid, and leader pipeline data in parallel for every visit.
- The nearby comment says the default tab is `plan`, but the current page order/default is Readiness first.

Why it matters:

The stale comment creates confusion, and the eager reads may become a performance drag as Multiply data grows. It works now, but it is easy for future work to optimize against the wrong mental model.

Recommended change:

- First fix the inaccurate comment.
- Then use existing read timing logs to decide whether the eager `Promise.all` should become route/search-param-aware loading or streaming/lazy per-tab loading.

Safe now or wait:

- Safe now for the comment.
- Wait for performance evidence before changing loading architecture.

### [ ] M7. Reconcile stale advisor artifacts so future agents do not chase completed work

Where:

- `plans/README.md` still lists older generated plans as TODO.
- `docs/audits/2026-06-21-full-codebase-audit.md` is a historical snapshot and includes findings that now appear fixed or covered by static checks.

Why it matters:

Stale planning artifacts are not runtime bugs, but they are a real maintenance hazard in this repo because agents and reviewers use these docs to choose work. A stale TODO list can waste time or cause duplicate refactors.

Recommended change:

- Mark old plan entries as completed, superseded, or intentionally deferred.
- Keep historical audit files immutable where useful, but add a short status note or pointer to the current cleanup backlog.
- Treat `DESLOPPIFY.md` as the active cleanup queue until replaced.

Safe now or wait:

- Safe now as docs-only work.
- Best done after choosing whether this backlog becomes the canonical cleanup tracker.

## 3. Nice-to-Have Polish

### [ ] N1. Deduplicate repeated `ReadResult` test helpers

Where:

Repeated `ok` / `fail` helper definitions appear across many tests, including:

- `lib/supabase/__tests__/read-batch.test.ts`
- `components/admin/follow-ups/__tests__/follow-ups-data.test.ts`
- `components/admin/care/__tests__/care-data.test.ts`
- `components/admin/care/__tests__/care-data-degrade.test.ts`
- `components/admin/care/__tests__/notes-feed-data.test.ts`
- `components/admin/group-health/__tests__/group-health-data.test.ts`
- `components/admin/person-detail/__tests__/person-detail-data.test.ts`
- `components/admin/launch-planning/__tests__/launch-planning-data.test.ts`
- `components/admin/groups/__tests__/group-management-data.test.ts`
- `components/admin/groups/__tests__/group-detail-data.test.ts`
- `components/admin/people/__tests__/people-data.test.ts`
- `components/admin/super-admin/__tests__/super-admin-console-data.test.ts`
- `components/admin/leader-pipeline/__tests__/leader-pipeline-data.test.ts`
- `components/admin/guests/__tests__/guests-data.test.ts`
- `components/admin/guests/__tests__/guests-data-batch.test.ts`
- `components/admin/multiply/__tests__/multiply-plan-data.test.ts`
- `components/admin/settings/__tests__/settings-data.test.ts`
- `components/admin/shepherd-care/__tests__/shepherd-care-detail-data.test.ts`
- `components/admin/shepherd-care/__tests__/over-shepherd-detail-data.test.ts`
- `components/admin/plan/__tests__/plan-data.test.ts`
- `lib/admin/__tests__/care-needs-contact.test.ts`
- `lib/admin/__tests__/check-in-detail-data.test.ts`

Why it matters:

The duplication is low-risk but noisy. It makes tests longer and encourages slightly different helper shapes over time.

Recommended change:

- Add a shared `tests/support/read-result.ts` with `okRead` and `failedRead` helpers.
- Migrate tests incrementally when they are touched, or do one mechanical test-only cleanup PR.

Safe now or wait:

- Safe now as test-only cleanup.

### [ ] N2. Normalize remaining internal comments after the group-type pivot

Where:

- Dashboard and fallback comments still say "cells" even where rendered UI copy now says "group types".
- Some names such as `readyCells` and `activeCells` may be legacy internal names rather than true product terms.

Why it matters:

Comments and internal names shape future changes. If they keep the old product model alive, the UI copy will drift again.

Recommended change:

- After M1, do a small comments-only pass.
- Decide separately whether internal field renames are worth the churn.

Safe now or wait:

- Safe now for comments.
- Wait for shared field renames unless paired with M1.

### [ ] N3. Add small client-component contract tests only when touching those components

Where:

- Client-side auth/navigation helpers and small interaction components are covered unevenly compared with server utilities and read models.

Why it matters:

This is not a current defect, but small client components can regress through prop or route changes without tripping server tests.

Recommended change:

- Do not start a broad testing campaign.
- When editing a client component, add one nearby test for its important contract: visible label, role-specific route, disabled/pending behavior, or callback invocation.

Safe now or wait:

- Wait until those components are touched.

## Suggested Selection Order

1. M1 - Finish the Multiply "Cell" to "Group Type" cleanup.
2. M3 - Build the action coverage map and fill highest-risk gaps.
3. M6 - Fix the stale Multiply tab-loading comment, then decide on lazy loading.
4. N1 - Deduplicate `ReadResult` test helpers.
5. M7 - Reconcile stale advisor artifacts.
6. M2 - Split one oversized module.
7. M4 - Add seeded browser happy paths.
8. M5 - Verify required RLS integration protection.
