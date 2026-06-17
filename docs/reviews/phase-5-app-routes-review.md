# Phase 5 Review — `app/(protected)/**` + public/auth routes

Working notes. Read-only review against `coding-standards` + `/simplify`. ~130
non-test files: 96 under `app/(protected)` (admin ~70, leader/over-shepherd/
account/root ~26) + ~34 public/auth routes. 40 server-action files, 33 thin page
guards. Tests excluded (Phase 6).

**Headline:** the write path is exemplary — ~50 server actions all route through
the shared `runAdminWriteAction`/`runLeaderWriteAction` runner with the
**validate → guard → RPC → revalidatePath → log** pipeline intact, named-column
reads only, no `select("*")`/service-role, paired audit in the RPC. No P0
violations. The duplication that remains is **boilerplate around the runner** and
small page-preamble repetition — not in the pipeline. Auth-flow files are
intentionally shaped and stay category C.

> **Cross-PR note:** the `extractClientIp` dedup (below) targets a new
> `lib/security/client-ip.ts` rather than editing `lib/security/rate-limit.ts`,
> to avoid overlapping Phase 2's edit to that file.

---

## (A) Safe auto-fixes — behavior-preserving

1. **`super-admin/test-accounts-actions.ts` is not Prettier-clean** (4-space /
   trailing-commas-on-call-args; `prettier --check` fails — predates the hook).
   `prettier --write` it.
2. **`check-ins/[groupId]/page.tsx:20`** hand-rolls `UUID_RE` — use the shared
   `isUuid` (`@/lib/shared/uuid`) like the other dynamic routes.
3. **`leader-pipeline/page.tsx:24`** inline `style={{…color:"#7d3621"}}` magic
   hex/numbers for the degraded-read banner — use the Tailwind tokens
   (`bg-roseSoft text-rose`) the sibling pages (`multiply`, `plan`) already use.
4. **`group-health/page.tsx:19`** — the `no-db` and `error` branches are
   near-identical JSX; collapse into one `(message, tone)` render helper.
5. **`leader/[groupId]/checkin/page.tsx:50/146`** — alias the
   `"present"|"absent"|"excused"` union once (`type AttendanceStatus`) instead of
   spelling it twice.
6. **`leader/page.tsx:36`** — hoist `MAX_WIDTH = 720` to module scope (sibling
   `account/page.tsx:11` already does).
7. **`invite/[token]/page.tsx:56`** — reuse `PublicPageShell` (the straggler;
   its 7 sibling public pages already do — its doc comment says it was extracted
   for exactly this). Visual no-op.
8. **`people/actions.ts:420` `adminCreateMinistryAdmin`** — dead `NOT_ENABLED`
   stub ("no UI hits today"); remove if truly unreferenced (verify first).

---

## (B) Needs-judgment — behavior-preserving extractions (the real value)

Ordered by leverage.

1. **Edge-Function error plumbing duplicated ~150 lines** —
   `super-admin/invite-user-actions.ts` ↔ `test-accounts-actions.ts` each define
   `FN_ERROR_MESSAGES`, `mapFnError`, JWT-`redact`, `extractErrorBody`
   (byte-identical), `tokenForStatus`, `buildErrorLines`. Extract a parameterized
   `lib/admin/edge-fn-error.ts` (the per-surface message map + status defaults
   stay arguments). Biggest single reuse win. _Recommended._
2. **`requireConfirmPhrase(raw, phrase, message)`** — the type-to-confirm
   validator is copy-pasted across 6 danger-zone action files (`clean-slate`,
   `reset-all`, `audit-reset`, `attention-reset`, `history-reset`, `launch-prep`,
   `permanent-delete`). Pure validation, no pipeline impact → `lib/admin/danger-zone`.
   _Recommended._
3. **All-entries FormData reader duplicated 6×** —
   `payloadFromInput`/`readForm` in `leader/[groupId]/care/actions.ts:27`,
   `.../calendar/actions.ts:23`, `admin/groups/[groupId]/calendar/actions.ts`,
   `invite-link-actions.ts:27`, `clean-slate-actions.ts:36`, `account-actions.ts:71`,
   `permanent-delete-actions.ts:34`. **Behavior nuance:** the calendar variants
   coerce non-string→`undefined`, others→`String(value)` — only dedup the
   byte-identical group, or parameterize the rule; do not silently change a call
   site's coercion. Natural home: next to the runner.
4. **`extractClientIp` duplicated verbatim** — `forgot-password/actions.ts:39` ≡
   `invite/[token]/actions.ts:49` (same trusted-proxy header logic). Extract to a
   new `lib/security/client-ip.ts` (NOT editing rate-limit.ts). Security-sensitive
   → must be a behavior-preserving move; reviewer confirms the header-trust logic
   is unchanged. (Fold `EMAIL_RE`, duplicated in both, into the same/validation
   module.)
5. **`pickMonthParam` duplicated verbatim** — `admin/calendar`, `launch-planning`,
   `planning` pages (+ an inline variant in `groups/[groupId]/calendar`). Extract
   `lib/calendar/month-param.ts`. And a `firstParam(value)` util for the
   `Array.isArray(v)?v[0]:v` idiom repeated in ~6 page/searchParams sites.
6. **`over-shepherd/[profileId]/page.tsx:70-86`** — missing `if (!client) notFound()`
   after `createSupabaseServerClient()` (every sibling page has it), so it relies
   on 4× `client!` assertions; also a loose `as { full_name?: string }` on the one
   raw inline `profiles` read. Add the guard (drops the assertions) and/or route
   the name through a typed read-model. Small error-path behavior change — worth it
   for consistency.
7. **`toShellUser(session.profile)` derivation** — the `{ name, email, role }`
   shell-user object + the `PastoralAppShell` nav/headerSlot preamble is rebuilt
   across ~6 leader/over-shepherd/account pages. A low-risk `toShellUser` helper
   removes the 6 repetitions (the fuller shell-wrapper is a bigger judgment call).
8. **`account/actions.ts:64` RPC error via `token.includes(...)`** — brittle
   substring matching for `forbidden_target`/`deletion_already_requested`; at least
   hoist to named constants (the bespoke redirect-after-signout flow can't use the
   runner).

### Defer (low payoff / intentional)

- Per-surface `REVALIDATE_PATH = "/admin/super-admin"` literal repeated 6× — a
  shared const is purely cosmetic; locality is fine.
- The ~50 4-line `export async function X(prev,input){return runAdminWriteAction(SPEC,…)}`
  wrappers — intentional runner ergonomics (typed Server Action boundary); a
  `makeAction(spec)` factory would obscure the exported signature. Leave.
- Generic `readSnapshotRow<T>` for the 4 reset count read-backs — modest payoff;
  each reads a different table/columns. Optional.

---

## (C) Invariant-adjacent — DEFER (do not touch)

- **Auth-flow wiring** — `login/{actions,login-form,next-path}`,
  `forgot-password/actions`, `reset-password/*`, `invite/[token]/{actions,…}`,
  `auth/confirm/{route,safe-next}`, `welcome/actions`: submit/redirect/cookie/
  token/`signInWithPassword`/`verifyOtp`/`PW_SETUP_COOKIE`/enumeration-safe copy.
  The B4/B5 extractions are scoped to non-flow fragments only.
- **`isSafeNextPath`/`safeNext` duplication** (`login/next-path.ts` vs
  `auth/confirm/safe-next.ts`) — open-redirect guards on two flows, each
  unit-tested to its own contract. Leave.
- **Guard semantics** — `leader/actions.ts` inline assigned-group guards
  (`:88`/`:158`) + the explicit per-field `leader_submit_group_checkin` RPC arg
  mappers (the eyeball-able write-side trust boundary, issue #636); the
  `requireOverShepherdOrAdminSession` + `canReadPrivateNotes = role==="ministry_admin"`
  Private-Care-Note seam (`shepherd-care/care-notes-actions.ts`); the route-handler
  super-admin gates (`clean-slate/export`, `people-import-template`); runner-seam
  holdouts (password reset, invite, file-import, permanent-delete preflight). Do
  not fold into the runner or alter the gates.
- **Every `revalidate:` path target and `auth:` gate override** — cache
  correctness + authorization. The existing shared path-_lists_
  (`shepherdCarePaths`, `CANDIDATE_REVALIDATE`, …) are good; no change.
- **`a11y-harness/*`** — Playwright+axe scaffold; do not restructure rendered
  output/aria.

---

## Recommended fix set for the Phase 5 PR

Take **all of (A)** + the **behavior-preserving (B) extractions #1–#7** (edge-fn
error module, `requireConfirmPhrase`, the byte-identical FormData-reader dedup,
`extractClientIp` → `lib/security/client-ip.ts`, `pickMonthParam`/`firstParam`,
the over-shepherd client guard, `toShellUser`). Defer **B#8** (account error-token
constants — optional) and the low-payoff items. **(C)** untouched. Each extraction
must preserve exact behavior (especially the FormData coercion nuance and the
client-IP trust logic); gate on typecheck + lint + test:run + build.
