# Big shells get a view-model seam where branching earns it (invite workflow first)

**Status:** Accepted — 2026-07-07. Implements candidate 6 (safe slice) in the
[2026-07-06 architecture deepening review](../reviews/2026-07-06-architecture-deepening-review.html).
Generalizes the `lib/forms/confirm-action-view.ts` precedent (#489): pure
decisions extracted from a `"use client"` shell so the lifecycle is
unit-tested once, with the component reduced to hooks + markup.

The review's mass diagram found ~15 stateful shells (~6,100 lines) holding the
app's client wiring — optimistic updates, pending gating, save/refresh
choreography — with **zero unit tests**, while their pure `*-data.ts` siblings
are almost all tested. The interface of each big shell is its rendered DOM;
you can only test past it, and only via a11y specs that skip without seeded
credentials, so in default CI this behaviour has no coverage. The candidate
was tagged **speculative** with an explicit rule: apply the seam shell by
shell, only where the wiring is branchy enough to earn it.

## Decision

**The invite workflow's state choreography is a pure view model:
`lib/admin/invite-workflow-view.ts`.**
`components/admin/forms/invite-workflow-form.tsx` (577 lines, three server
actions, 13 `useState` + 2 `useTransition`, guarding the app's most
security-sensitive writes) was the branchiest untested shell. What moved is
every decision that doesn't need React:

- `shareLinkPayload` — the link-path payload assembly: group gating
  (`group_id` only for a group-assignable role with a group picked),
  `single_use` serialization, and the datetime-local → absolute-ISO custom
  expiry.
- `namedLinkOutcome` / `shareLinkOutcome` — settlement of the two imperative
  server-action calls as discriminated unions, including the
  `existing_reused` no-link branch and its copy, and the errors-always-joined
  rule.
- `inviteEmailSuccessReset` — the post-success React-state reset the
  `<form>`-only `useActionForm` reset can't cover.
- `inviteWorkflowButtonsView` — labels + disabled: the email-path buttons
  gate on each other, the share button pends independently.
- `inviteSubmitRoute` — the Enter-key/`action={…}` routing between the form
  action (email) and the imperative generate handler (link).
- `inviteResultLine` / `shareLinkDescription` — the derived success copy.
- The already-pure config tables and `formatExpiry`, moved verbatim.

**Derivation functions, not a reducer.** The branchy logic is settlement of
async results and payload assembly; a reducer can't own the `useTransition`
calls or clipboard side effects anyway, and would force a rewrite of a
component that must not change behaviour. The repo's idiom is discrete
`useState` + render-time derivation (`useValueChange`,
`formStatusView`, `confirmActionButtonView`) — this follows it.

**Success types re-homed, not imported from `app/`.** No production `lib/`
module imports from `@/app/**`. `InviteUserSuccess` and
`CreateInviteLinkSuccess` now live in the view module; the two `"use server"`
action files import them and keep `export type { … }` re-exports, so their
public contract is unchanged (type-only, erased at compile time).

**The shell is now a projection.** The component keeps `useActionForm` +
`formRef`/`reportValidity()`/`FormData`, the transitions, clipboard + 2-second
copied flashes, and the JSX; its handlers `switch` on the outcome `kind` and
set state. Rendered DOM and copy are unchanged.

**Tests land in the default lane.**
`lib/admin/__tests__/invite-workflow-view.test.ts` (node env, pure values:
group/expiry gating, both settlement unions, reset, button views, routing,
derived copy) plus a thin `components/admin/forms/__tests__/invite-workflow-form.test.tsx`
(jsdom, actions mocked) proving each settled outcome lands in the right state
slot and the delivery toggle routes the submit.

## Finding: the check-in twins were already satisfied

The candidate named `check-in-{detail,review}-shell.tsx` as the starting pair
("one view model, two thin shells"). Inspection found **no state to extract**:
both are stateless server components; all derivation already lives in
`lib/admin/check-ins.ts` behind the reads seam (ADR 0015), with
`buildCheckInDetailData` covered by `check-in-detail-data.test.ts`. Their only
duplication is a local `ErrorBanner` + identical error copy — deliberately
**not** deduped: the shared `components/lg/ErrorBanner` renders different
markup (`<p>`, `rounded-[8px]`, `py-2.5` vs the twins' `<div>`, `rounded-sm`,
`py-3`), so dedup would either change DOM on two gated pre-pivot surfaces
(ADR 0033) or mint a second shared banner variant for two call sites.

## The boundary: what deliberately stays outside

- **`components/leader/check-in-form.tsx`** (501 lines) — stateful but
  low-branch: controlled inputs feeding a native form action, one derived
  counts memo. The seam wouldn't pay yet.
- **`components/admin/groups-directory.tsx`** (717),
  **`launch-planning/scenario-form.tsx`** (510), and the remaining ≥275-line
  shells — future slices, taken one at a time when their wiring is branchy
  enough, per the candidate's own rule. Not a blanket refactor.
- **`fetchAdminWeeklyCheckInReview`'s untested assembly** — a real gap the
  inspection surfaced, but read-side and out of this slice's scope; deferred.

## Consequences

- The invite workflow's branches (existing-login reuse, group gating, custom
  expiry, Enter routing, success reset) are unit-tested in `test:run`; a
  wiring change now has a test target instead of only a cred-gated a11y path.
- The seam has a second worked example beyond `confirm-action-view`, so the
  next branchy shell has a shape to copy: decisions in a `*-view.ts`, shell
  binds and renders.
- All six candidates of the 2026-07-06 review are now dispositioned —
  implemented as safe slices, found already satisfied, or recorded as
  deliberate deferrals.
