# App Completion Roadmap: Life Groups Ministry Operations

> 🗑️ **Superseded — do not use.** This is the earlier of two 2026-05-19
> completion-roadmap snapshots. The authoritative archived roadmap is
> [`CLAUDE_APP_COMPLETION_ROADMAP.md`](./CLAUDE_APP_COMPLETION_ROADMAP.md);
> read that one instead. Both snapshots are themselves off the North-Star path —
> current truth lives in [`../PRD.md`](../PRD.md) and
> [`../adr/`](../adr/). Retained for implementation history only.

- **Generated:** 2026-05-19T00:00:00Z (UTC)
- **Branch reviewed:** `work`
- **Commit reviewed:** `7332b57b90a4ecfbd7765e2041e9a81e5117b72d`
- **Review mode:** Independent repo review (README claims verified against code/migrations where possible)

## Executive Summary

### Current state (5 bullets)

- The app is beyond prototype: protected role-aware routes, Supabase Auth, RLS foundation, and a broad admin + leader operations surface are implemented.
- Write operations are intentionally centralized through SECURITY DEFINER RPCs rather than direct client table writes, reducing accidental policy bypass in UI code.
- Core ministry loop is mostly present: people/groups setup, weekly check-ins, admin review, guest pipeline, follow-up tasks, and settings-driven dashboard metrics.
- Privacy posture is thoughtful but not “finished hardening”: leader read paths intentionally omit `admin_private_note`, but the repo documents that this currently relies on app read-shaping rather than DB-level column isolation.
- Build reliability is currently blocked in this environment due to external Google Fonts fetch during `next build`; lint/typecheck pass.

**Biggest strength:** coherent product architecture with explicit phase docs and disciplined RPC + audit patterns.

**Biggest risk:** privacy/security assumptions that are enforced primarily in app read-model code rather than fully in DB primitives (acceptable for MVP with clear guardrails, but needs hardening before wider rollout).

**Recommended next move:** **Immediate Stabilization** phase focused on verification, policy/RPC hardening, and role-based regression testing before adding any net-new functionality.

---

## Current App Map

| Route                       | User role                       | Purpose                                      | Maturity    | Notes                                |
| --------------------------- | ------------------------------- | -------------------------------------------- | ----------- | ------------------------------------ |
| `/`                         | Public                          | Marketing/landing shell                      | Medium      | Stable but not core ops workflow     |
| `/admin-preview`            | Public                          | Demo admin dashboard UX                      | Medium      | Fallback/demo route                  |
| `/leader-preview`           | Public                          | Demo leader UX                               | Medium      | Fallback/demo route                  |
| `/login`                    | Public                          | Auth entry                                   | High        | Generic error handling; role routing |
| `/unauthorized`             | Public                          | Access boundary messaging                    | High        | Clear route-level gate fallback      |
| `/admin`                    | `ministry_admin`, `super_admin` | Command center dashboard                     | High        | Week param + metrics + setup gaps    |
| `/admin/people`             | `ministry_admin`, `super_admin` | Leaders/members lifecycle + assignment       | High        | Mature operational forms             |
| `/admin/groups`             | `ministry_admin`, `super_admin` | Group CRUD-ish lifecycle (soft close/reopen) | High        | No hard delete surface               |
| `/admin/settings`           | `ministry_admin`, `super_admin` | Metric defaults + per-group overrides        | Medium-High | Powerful but potential complexity    |
| `/admin/check-ins` + detail | `ministry_admin`, `super_admin` | Weekly submission review                     | High        | Good for weekly admin rhythm         |
| `/admin/guests`             | `ministry_admin`, `super_admin` | Guest pipeline management                    | Medium-High | Manual pipeline present              |
| `/admin/follow-ups`         | `ministry_admin`, `super_admin` | Follow-up task management                    | Medium-High | Strong base, privacy caution areas   |
| `/admin/super-admin`        | `super_admin`                   | Audit + role governance + status checklist   | High        | Clear privileged boundary            |
| `/leader`                   | `leader`, `co_leader`           | Group check-ins + assigned follow-ups        | High        | Assignment-scoped operations         |
| `/leader/[groupId]/checkin` | `leader`, `co_leader`           | Weekly check-in write workflow               | High        | Core operator habit loop             |

Maturity legend: **High** = likely MVP-ready with hardening; **Medium-High** = usable but needs targeted polishing; **Medium** = useful but secondary.

---

## Architecture Assessment

### Auth / RLS

- Auth/session model appears cleanly separated (`middleware`, server/browser clients, request-level session helpers).
- Role gates are explicit at route boundaries and helper level.
- RLS appears SELECT-oriented with writes pushed into SECURITY DEFINER RPCs.
- **Risk:** correctness depends on both policy definitions and every reader choosing safe columns/scopes; this should be regression-tested systematically.

### RPC write model

- Strong pattern: narrow RPCs by product action, with atomic write + audit trail behavior repeatedly documented.
- Good security design intent: avoid service-role usage in app code and avoid broad table write exposure.
- **Risk:** SECURITY DEFINER functions can become privilege escalators if auth checks drift from role semantics.

### Read models

- Typed read helpers and structured dashboard queries are a major maintainability win.
- Fallback/demo and live read paths are clearly distinguished.
- **Risk:** duplicated business logic between SQL, read models, and UI can create metric drift over time.

### Type safety

- TypeScript coverage appears broad, with typed enum/model helpers and action contracts.
- `as never` casts around `.rpc()` boundaries are pragmatic but create a “trust boundary”; keep contracts tested.

### Fallback/demo data

- Good product/design choice for preview routes and no-env resilience.
- **Risk:** operators might misread fallback vs live unless badges/notices remain very obvious.

### Migrations and schema evolution

- Phase-structured migrations and docs are unusually strong for this stage.
- **Risk:** long chain of migrations/RPC assumptions increases chance of environment drift if deployment checklist is weak.

### Audit trail

- Audit events are first-class and integrated into privileged UI.
- Visibility boundary (`super_admin`) is good governance posture.

### Deployment assumptions

- Build currently dependent on network fetch of Google Fonts in this environment.
- Production readiness should include deterministic font strategy and environment checks.

---

## Product Workflow Assessment

### Admin workflow

- End-to-end loop exists: monitor dashboard → inspect check-ins → adjust people/groups/settings → handle guests/follow-ups.
- Strength: intentional “operations cockpit” direction.
- Gap: risk of cognitive overload due to many control surfaces and terms.

### Leader workflow

- Strong weekly rhythm: see assigned groups, submit check-ins, resolve follow-ups.
- Strength: constrained scope is ministry-friendly.
- Gap: unknown if all edge-case states are empathetic (late submissions, changed assignments, missing members).

### Guest workflow

- Manual pipeline stages are explicit and understandable.
- Gap: no public intake or automations (acceptable for current phase).
- Risk: without stricter data-quality enforcement, stages may become inconsistent in real usage.

### Follow-up workflow

- Admin can create/manage; leaders can act on allowed transitions.
- Strength: explicit status progression.
- Risk: sensitive notes need stronger DB-level isolation before broader team use.

### Dashboard workflow

- Dashboard appears aligned to weekly ministry decisions (missing check-ins, capacity watch, follow-up attention).
- Risk: metric trust depends on settings quality and completion of group metadata.

### Super admin workflow

- Clear separation for governance and role changes.
- Strength: audit + role ops centralized.

---

## UX Assessment

- **Admin usability:** Generally strong information architecture direction, but complexity burden is rising.
- **Leader usability:** Good constrained experience; likely the strongest persona fit today.
- **Mobile friendliness:** Not fully verified from repo; likely acceptable for basic forms but needs explicit mobile QA matrix.
- **Elderly/non-technical friendliness:** Tone and labeling are thoughtful; still likely needs simplification passes and “what to do next” cues.
- **Information overload risk:** High on admin surfaces with multiple metrics and states.
- **Empty states:** Present in several places; continue standardizing for all filtered/zero-state cases.
- **Forms:** Validation patterns appear present, but cross-form consistency should be audited.
- **Navigation:** Role-aware nav model is a strength; verify discoverability of newer routes.

---

## Security and Privacy Assessment

### What looks strong

- No intentional app service-role usage surfaced in reviewed areas.
- Role boundaries and privileged route separation are explicit.
- Write paths mostly consolidated through auditable RPCs.

### Key risks

- `admin_private_note` handling is carefully shaped in app reads, but the repo itself documents that column-level DB hardening is still a future item.
- SECURITY DEFINER RPCs require ongoing scrutiny for role checks, tenant/scope checks, and immutable audit guarantees.
- Any reader using broad selects in the wrong context could expose sensitive data if not guarded by strict helper patterns.

### Recommended hardening

- Move sensitive-column protections from “reader convention” to enforceable DB contracts (e.g., leader-safe view / stricter grants).
- Add automated assertions for role boundary + sensitive field leakage.
- Build a periodic RLS + RPC permission audit checklist into release process.

---

## Data and Metrics Assessment

- **Capacity logic:** Rich configurable model exists (defaults + overrides + exclusions), which is powerful but may be too flexible for early operators.
- **Health logic:** Multiple health signals are available; ensure definitions are clearly documented in UI copy.
- **Check-in logic:** Appears robust with weekly framing and admin review loop.
- **Guest pipeline metrics:** Good foundational stage model; quality depends on disciplined human updates.
- **Follow-up metrics:** Present and useful; should focus on “aging/open overdue” visibility next.
- **Setup completeness:** Dashboard setup-gaps is a major strength; keep it prominent.
- **Configurability guidance:** Not everything should be user-configurable; lock core formulas until operator confidence is high.

---

## Testing and Verification Assessment

### Existing checks in this review

- `npm run lint`: pass.
- `npm run typecheck`: pass.
- `npm run build`: fail in this environment because Next.js cannot fetch Google Fonts URLs.
- Required security greps run; results recorded below.

### Security grep findings (raw summary)

- `grep -r service_role .` → many hits in `node_modules` and docs; no immediate evidence of app-layer service-role key usage from this grep alone.
- `grep -ri "SUPABASE_SERVICE\|sb_secret" .` → hits in docs; no app code secrets surfaced in quick scan output.
- `grep -ri "admin_private_note" app/ components/ lib/` → expected references in admin forms/actions and explicit leader-side privacy comments/types.
- `grep -ri "create policy .*insert\|create policy .*update\|create policy .*delete" supabase/migrations/` → no broad write-policy additions surfaced by this pattern.
- `grep -ri "\.delete(" app/ components/ lib/` → no matches.

### Missing automated test layers (priority)

- Integration tests for role-route matrix and redirect behavior.
- Contract tests for each RPC (allowed/denied paths + audit row side effects).
- Data-leak tests asserting leader payloads never contain admin-only fields.
- Dashboard metric snapshot tests against fixed seeded scenarios.

### Recommended regression suite

- Role-based smoke matrix (super_admin, ministry_admin, leader, co_leader, unauthorized).
- Weekly check-in lifecycle scenario pack.
- Guest→follow-up pipeline scenario pack.
- Settings override impact on dashboard metrics.

---

## Recommended Roadmap

### Phase: Immediate Stabilization

**Goal:** Verify and harden current capabilities without adding new product surface.

**Why it matters:** Current app breadth is high; trust/safety must catch up before expansion.

**Key tasks**

- [P0] Build role-based QA matrix and execute end-to-end smoke tests.
- [P0] Add automated leakage tests for `admin_private_note` and any admin-only fields.
- [P0] Add RPC contract tests (allow/deny/audit expectations).
- [P1] Formalize deployment/build checks (fonts/network determinism, env validation).
- [P1] Tighten docs where behavior and README may drift.

**Out of scope**

- New channels (SMS), integrations, public forms, mobile app.

**Acceptance criteria**

- Repeatable QA checklist with pass/fail history.
- Sensitive-field leak tests in CI.
- RPC permission coverage documented and passing.
- Build determinism plan documented and validated.

**Risk level:** **Medium** (mostly verification/hardening, moderate blast radius).

---

### Phase: Strong MVP Completion

**Goal:** Complete the core weekly ministry operating loop with high operator confidence.

**Why it matters:** Converts feature-rich app into dependable daily/weekly tool that replaces spreadsheets.

**Key tasks**

- [P0] Simplify and standardize admin UX flows (people/groups/settings/follow-ups).
- [P0] Add workflow guardrails (required fields, state-transition hints, overdue cues).
- [P1] Improve empty/filter states and “next action” recommendations.
- [P1] Expand docs/playbooks for ministry operators (not just engineers).
- [P1] Add minimal observability: error logging conventions and audit review cadence.

**Out of scope**

- Heavy automation, external integrations, advanced rule engines.

**Acceptance criteria**

- Admin can run weekly ministry cycle start-to-finish without spreadsheet dependency.
- Leaders can reliably submit/update check-ins and resolve follow-ups.
- Support docs enable non-technical staff onboarding.

**Risk level:** **Medium-High** (touches many user-facing flows).

---

### Phase: Production Polish

**Goal:** Improve reliability, accessibility, and maintainability for sustained real-world usage.

**Why it matters:** Reduces training/support burden and prevents trust erosion.

**Key tasks**

- [P0] Accessibility pass (keyboard, focus order, labels, contrast, error messaging).
- [P0] Mobile-responsiveness QA and layout refinements for admin + leader flows.
- [P1] Performance profiling and targeted server/data optimizations.
- [P1] Standardize interaction patterns and component-level UX consistency.
- [P1] Add change-management docs (release checklist, rollback notes, data migration safety).

**Out of scope**

- New major product modules.

**Acceptance criteria**

- Accessibility baseline documented and passing.
- Mobile usability sign-off for key workflows.
- Operational runbook for deployment/incidents exists.

**Risk level:** **Medium**.

---

### Phase: Future Enhancements

**Goal:** Add leverage features only after workflow and trust foundations are stable.

**Why it matters:** Prevents premature complexity and support burden.

**Key tasks**

- Prioritize by operator pain signals and real usage telemetry.
- Introduce features behind explicit guardrails and migration plans.

**Out of scope**

- Any enhancement that bypasses established security/testing standards.

**Acceptance criteria**

- Enhancement RFC process with ROI + risk assessment.

**Risk level:** **High** (scope creep and complexity risk).

---

## Do Not Build Yet

- **SMS** — adds compliance, opt-in/out, deliverability, and support burden; premature before workflow reliability.
- **Public guest intake forms** — increases spam/privacy surface and data-quality issues before internal ops maturity.
- **Prayer/care notes** — highly sensitive pastoral data; needs stricter privacy model first.
- **Calendar integration** — integration complexity and sync edge cases; low immediate ROI.
- **Exports** — useful but can encourage spreadsheet fallback before in-app behavior stabilizes.
- **Native mobile app** — duplicates surface area; web workflow must mature first.
- **Advanced formula editor** — high complexity and misconfiguration risk for non-technical admins.
- **Complex automation** — can hide process gaps and create silent failures early.
- **Bulk import** — data hygiene risk unless validation/dedupe workflows are robust.
- **Auth invitations** — operationally valuable later, but increases identity lifecycle complexity now.

---

## Best Next Prompt (Copy/Paste)

```md
You are working in the lifegroups repo.

Goal:
Execute the “Immediate Stabilization” phase only (no net-new product features).

Scope:

1. Add an automated role-based regression test matrix for key protected routes:
   - /admin, /admin/people, /admin/groups, /admin/settings, /admin/check-ins, /admin/guests, /admin/follow-ups, /admin/super-admin, /leader
   - roles: super_admin, ministry_admin, leader, co_leader, unauthorized
2. Add automated privacy tests proving leader-visible read paths never expose follow_ups.admin_private_note.
3. Add RPC contract tests for allow/deny behavior + audit row expectations for:
   - leader_submit_group_checkin
   - leader_update_follow_up_status
   - admin_update_follow_up_status
4. Produce/update a single verification doc with exact commands run, pass/fail results, and known environment limitations.

Constraints:

- Do not add new user-facing features.
- Do not change business logic except minimal fixes required to make tests deterministic.
- Keep test fixtures small and explicit.
- If any behavior cannot be verified from repo, label it “Not verified from repo.”

Deliverables:

- Tests added and passing where environment permits.
- Verification markdown in docs/.
- Short summary of residual risks after stabilization.
```

---

## Verification Commands and Results (this review)

- ✅ `npm run lint` — passed (no ESLint warnings/errors).
- ✅ `npm run typecheck` — passed.
- ⚠️ `npm run build` — failed in this environment due to Google Fonts fetch failures (`next/font` remote fetch errors for Inter/Fraunces/JetBrains Mono/Newsreader).
- ✅ `grep -r service_role .` — matches found mainly in `node_modules` and docs; no direct app secret usage identified from this grep.
- ✅ `grep -ri "SUPABASE_SERVICE\|sb_secret" .` — doc references found; no direct app secret env usage identified from this grep output.
- ✅ `grep -ri "admin_private_note" app/ components/ lib/` — expected references found in admin + privacy shaping code.
- ✅ `grep -ri "create policy .*insert\|create policy .*update\|create policy .*delete" supabase/migrations/` — no concerning broad write-policy matches in grep output.
- ✅ `grep -ri "\.delete(" app/ components/ lib/` — no matches.
