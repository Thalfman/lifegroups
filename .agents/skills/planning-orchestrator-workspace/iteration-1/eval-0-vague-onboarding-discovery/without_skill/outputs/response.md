# Discovery Brief: Improving Life Group Leader Onboarding

You asked me to help plan how to "improve how Life Group Leaders get onboarded." Before I hand you a build plan, I want to make sure we plan the _right_ thing — because "onboarding" in this app could mean at least three very different problems, and they point at completely different work. This brief separates the request from the underlying goal, lays out what the code already does, names the real fork in the road, and recommends what to do next.

**Bottom line up front:** This is _not yet_ ready for an implementation plan. The invite/auth machinery is already strong and recently rebuilt; the likely real gap is the _leader's first-run experience and the "is my leader actually set up?" blind spot_ — but which of those matters depends on an answer only you have (where leaders actually fall off). I recommend a short discovery step before building. I've also included a labeled best-guess plan you could greenlight if you'd rather move now.

---

## 1. What I read as the request vs. the underlying goal

- **Stated request:** "Improve how Life Group Leaders get onboarded into the app."
- **Underlying goal (my read):** When Julian (or Tom) brings a new Leader into the system, that Leader should reliably reach a state where they're _actually using_ the app to care for their group — logging in, understanding what the surface is for, and writing their first Care Note / managing their calendar — without Julian having to chase them or do manual cleanup.

The gap between those two framings is the whole point of this brief. "Onboarding" is the mechanism; "a Leader who's actually active and cared-for" is the outcome. If we optimize the wrong link in that chain, we'll ship polish nobody needed.

---

## 2. What already exists (so we don't rebuild it)

I mapped the current flow end to end. It is more complete than "improve onboarding" might suggest — most of it shipped recently under ADRs 0017, 0024, and 0025.

**The invite + account-activation path (admin-driven, solid):**

- A Super Admin invites from `/admin/super-admin` via three delivery modes — email invite, copyable setup link, or anonymous shareable link (`components/admin/forms/invite-workflow-form.tsx`).
- Invite collects email, role (`leader` / `co_leader`), optional phone, **optional group assignment** at invite time. Notably the inviter does **not** type the name (ADR 0025) — the invitee names themselves.
- The `invite-user` Edge Function provisions Supabase Auth and calls `super_admin_complete_invite()`, which writes the profile, the `group_leaders` row, and a paired audit row atomically (`supabase/functions/invite-user/index.ts`).
- The invitee sets their name + password at `/reset-password`, with a `/welcome` fallback for abandoned setups (ADR 0025). The `lg_pw_setup` cookie pins them to setup until a password exists.

**The leader's first landing (thin):**

- Leaders land on `/leader` — "Your care space" — listing their assigned groups, each with Care notes + Calendar buttons (`app/(protected)/leader/page.tsx`).
- A one-time, dismissible **first-run card** ("Welcome to your care space…") is the _entire_ in-app orientation (`components/orientation/first-run-card.tsx`).
- If no group is assigned, they hit a static empty state: "You're signed in, but you're not assigned to lead a group right now."
- Login surface is **live by default** (ADR 0024); check-ins remain frozen behind a separate gate.

**An adjacent pattern worth knowing about (ADR 0027):**

- The _admin_ Home is already a "self-dismissing setup workspace" — it leads with a setup checklist while steps are incomplete, deep-links out to where the work lives, then reverts to a dashboard. This is the established house pattern for "guided setup," and any leader-onboarding work should mirror it rather than invent a new paradigm.

**Takeaway:** The plumbing (invite → auth → name → password → role → landing) is in good shape. The thin parts are (a) what the Leader experiences _after_ they land, and (b) Julian's ability to _see_ whether a Leader is actually set up and active.

---

## 3. The three problems hiding inside "onboarding"

This is the core of the brief. "Improve onboarding" most plausibly means one of these — and they barely overlap in implementation:

**A. Activation / first-run comprehension (leader-facing).**
The Leader logs in but doesn't understand what the care space is _for_, when to write a Care Note, that their notes are private until Julian flips a transparency toggle, or what happens next. Today that's one dismissible card. _Fix lives in:_ `/leader` UI, first-run experience, copy, maybe a light guided "write your first note" nudge.

**B. Readiness / setup-state (admin-facing).**
The most common day-one failure surfaced in the code: a Leader is invited but **never assigned a group**, so they land on a dead empty state with nothing to do — and _nobody is alerted_. There's no view telling Julian "these 4 leaders are invited but can't do anything yet." _Fix lives in:_ admin Home setup checklist (ADR 0027 pattern), an "incomplete leaders" surface, empty-state CTAs.

**C. Invitation delivery / completion (top-of-funnel).**
Leaders never receive, open, or complete the invite email; the link expires; setup is abandoned. There is currently **no app-level tracking** of invite delivery or completion — once the email goes out, it's a black box until they appear (or don't). _Fix lives in:_ invite observability, resend/expiry UX, completion tracking.

These are not the same project. A is a UX/copy effort. B is an admin-workflow + observability effort. C is a lifecycle-messaging + instrumentation effort.

---

## 4. Challenge to the framing

Two honest pushbacks before we commit:

1. **The bottleneck may not be "onboarding" at all — it may be observability.** Across the codebase there is no way for Julian to answer "which leaders have logged in / written a note / are stuck on the empty state." Audit events exist but require raw DB queries. If you can't _see_ where leaders drop off, any onboarding redesign is a guess. Lightweight instrumentation (problem C's measurement half) might be the highest-leverage _first_ move regardless of which fix we choose — it tells us whether A, B, or C is the real problem.

2. **Some "gaps" are deliberate design, not bugs.** The hidden member roster (ADR 0016/0020), group-scoped (not per-member) Care Notes, and frozen check-ins are intentional. An onboarding effort must not "helpfully" re-expose them. The transparency-toggle silence, by contrast, looks like a genuine comprehension gap worth fixing.

I'm not rejecting your direction — improving onboarding is clearly worthwhile. I'm flagging that **"onboarding" is under-specified by exactly one fact: where leaders actually fall off.** That fact changes the plan.

---

## 5. The one question that changes everything (plus two minor)

I'm deliberately asking very few. Only the first materially reshapes the plan:

1. **Where do leaders actually drop off today?** Pick the closest: _(a)_ they get invited but never complete signup/login; _(b)_ they log in once, don't get it, never come back; _(c)_ they're invited but Julian forgets to assign them a group, so they hit a dead end; _(d)_ honestly, we don't know. → (a) = problem C, (b) = problem A, (c) = problem B, (d) = start with instrumentation.

2. **Is this for Julian's 60+ _existing_ leaders, or only _new_ ones going forward?** (Backfilling existing leaders into a new flow is its own slice.)

3. **Whose pain are we solving first — the Leader's, or Julian's?** (Activation polish helps the Leader; a setup/readiness view helps Julian.)

If you'd rather not answer and just want momentum, the default-assumption plan below covers the most likely case.

---

## 6. Recommended next step

**Produce a thin instrumentation + readiness slice first, then decide.** Concretely, before any redesign:

- Add minimal observability so Julian can see, per Leader: invited / signed-in / has-group / has-written-a-note. This directly answers question 1 with data instead of opinion, and it's the measurement half of problem C anyway.
- Surface "invited but not yet set up" leaders in the admin Home setup checklist, reusing the **ADR 0027** pattern (deep-link to assign-a-group rather than building inline UI).

That combination de-risks every larger onboarding investment and delivers value (Julian stops losing leaders in the gap) on its own. Once the instrumentation reports where the real fall-off is, _that's_ when we write the focused implementation plan for A, B, or C.

This is why the brief stops here rather than handing you a full build plan: writing a confident implementation plan against an unknown drop-off point is the exact failure this discovery step exists to prevent.

---

## 7. If you want to move now: labeled best-guess plan

If you'd rather not wait for data, here's the plan I'd back, with assumptions stated so you can correct one thing instead of re-deciding everything.

> **Assumption (flag if wrong):** the real pain is **problem B** — leaders invited but left in a dead-end empty state because group assignment is forgotten — combined with **A**'s thin first-run experience.

**Scope (in):**

1. **Admin "leader readiness" view** — extend the ADR 0027 Home setup checklist with an "invited but not active" leader list (no group assigned, or never logged in), deep-linking to assign-a-group. Mirror the existing pattern; do not build inline forms.
2. **Better leader empty state** — turn the dead `/leader` empty state into something that reassures and orients ("Julian is setting up your group — here's what this space will do").
3. **Stronger first-run orientation** — expand beyond the single card to briefly explain Care Notes vs. Prayer Requests, the privacy/transparency model, and the calendar, surfaced contextually on first use.
4. **Minimal activation instrumentation** — log first-login and first-note events so success is measurable.

**Scope (out / non-goals):** changing the invite/auth/name/password flow (ADRs 0017/0024/0025 — already solid); re-exposing the member roster or check-ins (deliberately hidden); building a heavyweight multi-step wizard (conflicts with the in-context ADR 0027 philosophy); bulk email/SMS lifecycle campaigns.

**Key files / systems to touch (read-first list for the implementer):**

- `app/(protected)/leader/page.tsx` — landing + empty state
- `components/orientation/first-run-card.tsx`, `lib/account/orientation.ts` — first-run experience
- Admin Home setup workspace (per ADR 0027) — readiness checklist host
- `lib/observability/instrument.ts`, `lib/observability/logger.ts` — activation events
- `lib/auth/session.ts` — already loads `assignedGroupIds` (the signal for "has a group")
- Write path must follow the repo invariant: validate → guard → narrow `SECURITY DEFINER` RPC → `revalidatePath` → log, with a paired `audit_events` row. Any new admin action (e.g. surfacing readiness) is read-only or routes through an `admin_*` RPC.

**Acceptance criteria:**

- Julian can see, in one place, every leader who is invited but not yet able to act (no group), and reach the assign-a-group action in one click.
- A newly-activated leader with a group sees orientation that explains Care Notes, Prayer Requests, the privacy/transparency model, and the calendar.
- A leader with no group sees a reassuring, non-dead empty state.
- First-login and first-note events are logged and queryable.

**Test plan:** Vitest unit/component coverage for the new readiness read and any new action (reads-seam in-memory adapter, no live Supabase); update `tests/integration/rls-visibility.test.ts` if any new read crosses the leader/admin boundary; a11y check on the new leader empty/orientation states via the harness. CI gates on `npm run test:run` + the Playwright a11y suite.

---

## 8. Fresh-session handoff prompt

If you confirm the framing (or answer question 1), a future implementation session can start cold from this:

> **Task:** Improve Life Group Leader onboarding in the `/home/user/lifegroups` Next.js 15 + Supabase app. Discovery concluded the highest-value work is **(assumption — confirm) problem B + A**: leaders are invited but stranded when no group is assigned, and the first-run experience is too thin.
>
> **Goal:** A newly-invited Leader reliably reaches an _active_ state (logged in, oriented, first Care Note written), and Julian (Ministry Admin) can see at a glance which leaders are invited-but-not-yet-active and assign them a group in one click.
>
> **In scope:** (1) extend the ADR 0027 admin Home setup checklist with a "leaders invited but not active" list deep-linking to assign-a-group; (2) redesign the `/leader` empty state from dead-end to reassuring; (3) expand first-run orientation to explain Care Notes vs. Prayer Requests, the transparency/privacy model, and the calendar; (4) add first-login and first-note activation logging.
>
> **Non-goals:** changing the invite/auth/name/password flow (ADRs 0017/0024/0025); re-exposing the hidden member roster or frozen check-ins; a heavyweight wizard; external email/SMS campaigns.
>
> **Relevant files:** `app/(protected)/leader/page.tsx`; `components/orientation/first-run-card.tsx`; `lib/account/orientation.ts`; the admin Home setup workspace (ADR 0027); `lib/observability/instrument.ts` + `logger.ts`; `lib/auth/session.ts` (`assignedGroupIds` is the "has a group" signal).
>
> **Invariants:** writes go validate → guard → narrow `SECURITY DEFINER` RPC → `revalidatePath` → log, with a paired `audit_events` row in the same transaction; named-column reads only (no `select("*")`); role-gated (no hardcoded identities); respect Care Note transparency rules; archive, never hard-delete.
>
> **Acceptance + tests:** as listed in sections 7 above. Gate on `npm run test:run` and the Playwright a11y suite. Read `docs/adr/0017`, `0020`, `0024`, `0025`, and `0027` before starting.

---

### Why this is a discovery brief and not a plan

The invite machinery is already strong, so the leverage is downstream — but _which_ downstream gap (activation comprehension, admin readiness, or invite completion) is the real one depends on a drop-off fact you haven't told me and the app doesn't yet measure. Producing a crisp implementation plan against that unknown would be confidently aiming at the wrong target. One answer to question 1 — or one thin instrumentation slice — collapses this into a focused build plan, and section 7 is ready to go the moment you confirm the framing.
