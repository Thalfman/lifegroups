# Discovery Brief: Improving Life Group Leader Onboarding

Before planning _how_ to improve onboarding, I dug into what onboarding actually
is in this codebase today. The short version: the request points at a real
outcome, but "onboarding" here splits into at least three different problems with
different fixes, and the most likely real bottleneck is **not** the part that's
already well-built. This brief names the candidate targets, what I found in the
code, the one cheap thing that would tell us which target is right, and what to
plan next.

I have **not** changed any files. This is planning only.

---

## Stated request

> "I want to improve how Life Group Leaders get onboarded into the app. Can you
> help me plan this?"

A solution area ("onboarding") is named, but not a problem, a metric, or a
specific point of friction. That's the right time to do discovery rather than
jump to a redesign.

## Possible underlying goals

"Onboarding" almost always hides one of several distinct outcomes. Based on how
this app actually works, the live candidates are:

1. **Invite-to-active conversion** — more invited Leaders successfully reach an
   active, signed-in account (the _getting in_ problem: email delivery, the
   set-password + choose-name flow, abandoned setups).
2. **First-login activation / time-to-value** — a Leader who logs in actually
   _does the core thing_ (writes their first Care Note, opens their calendar)
   rather than landing, seeing little, and leaving (the _now what?_ problem).
3. **Readiness of the Leader's surface** — the Leader logs in but their space is
   empty or half-useful because an **admin hasn't finished the back-office
   setup** they depend on: assigning them to a group, and filling the group's
   meeting schedule (the _cross-actor dependency_ problem).
4. (Lower-likelihood) **Comprehension / role clarity** — the Leader doesn't
   understand what the app is for, why their notes are private, or what's
   expected of them.

These are not the same project. (1) is auth/email work, (2) is UX/product, (3)
is a workflow/notification gap that spans two roles, (4) is content/copy. A plan
aimed at the wrong one is wasted.

## Challenge to the stated direction

**The part of onboarding that's most visible — the signup/account flow — is the
part that's already most built.** Picking "improve onboarding" and reflexively
redesigning the invite or set-password screens would likely be low-leverage. The
codebase shows a genuinely mature account-provisioning pipeline:

- **Two invite paths**: a named email invite from `/admin/super-admin` (Edge
  Function `invite-user` → `super_admin_complete_invite` RPC) and an anonymous
  shareable link (`/invite/[token]` → `redeem-invite` Edge Function →
  `redeem_invitation` RPC).
- **A polished set-password + choose-your-name flow** (`/reset-password`, ADR 0025) with a `/welcome` fallback gate for sessions whose name is still pending,
  and an `lg_pw_setup` cookie that pins users to the setup screen so they can't
  get stranded mid-flow.
- **A first-run orientation card** (`components/orientation/first-run-card.tsx`,
  issue #560) with role-aware copy and a server-persisted dismissal.
- **A clear empty-state message** when a Leader has no group:
  _"You're signed in, but you're not assigned to lead a group right now…"_

So the honest challenge is: **the friction is probably not in the screens that
exist, but in two seams around them** —

- **The cross-actor dependency (goal 3).** A Leader's surface only becomes
  useful once an admin has (a) assigned them to a group via `group_leaders` and
  (b) filled the group's `meeting_day` / `meeting_frequency` /
  `meeting_week_parity`. Until then the Leader sees the "not assigned" empty
  state, or a calendar that says _"Schedule incomplete. Contact a ministry
  admin…"_. **Nothing notifies the admin that an invited Leader is waiting, and
  nothing tells the Leader what to do beyond "contact an admin."** This is the
  most likely real onboarding failure, and it's a workflow gap, not a screen.
- **No measurement (cuts across all goals).** There's a rich `audit_events`
  trail (invite sent, name set, etc.), but no funnel that answers _"of N Leaders
  invited this month, how many set a password, logged in, and wrote a first
  note — and where do they fall out?"_ Without that, any onboarding change is a
  guess.

I'd strongly recommend resolving _which_ bottleneck is real before designing a
fix. If you already have a specific pain in mind (e.g. "Leaders aren't writing
notes" vs. "invites never get accepted"), tell me and we can skip discovery and
go straight to an implementation plan for that target.

## What I found in the code (grounding)

The current Leader journey, end to end, with the real seams:

| Stage                 | What exists today                                                                                                | Where it lives                                                                                                 | Gap / friction                                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Invite                | Named email invite + anonymous link; both gated to super_admin                                                   | `app/(protected)/admin/super-admin/invite-*-actions.ts`; `supabase/functions/invite-user`, `redeem-invite`     | No visibility into _delivery_ success; relink-by-email sends no email by design (person must already know their password). |
| Set password + name   | `/reset-password` with name field when pending; `lg_pw_setup` cookie prevents stranding; `/welcome` fallback     | `app/reset-password/**`, `app/auth/confirm/route.ts`, `app/welcome/page.tsx`, ADR 0025                         | Mature. Abandoned setups can still slip through to `/welcome`, but it's handled.                                           |
| Role + group link     | `super_admin_complete_invite` / `redeem_invitation` write `profiles.role` and (optionally) a `group_leaders` row | `supabase/migrations/20260703000000_*.sql`; `lib/auth/session.ts` loads `assignedGroupIds`                     | **Group assignment is optional at invite time and often deferred** → Leader can be active with no group.                   |
| First login           | Role router → `HomeHub`; Leader empty state or group cards; dismissible first-run card                           | `app/page.tsx`, `app/(protected)/leader/page.tsx`, `first-run-card.tsx`                                        | The card orients but doesn't _guide to action_; if unassigned, the Leader hits a dead end.                                 |
| Core task: Care Notes | `/leader/[groupId]/care` — write group-scoped Care Notes + Prayer Requests, author-private by default            | `app/(protected)/leader/[groupId]/care/page.tsx`, `components/leader/group-note-write-form.tsx`, ADR 0017/0020 | Works immediately once assigned. But notes are **private by default** — a new Leader may not know if anyone reads them.    |
| Core task: Calendar   | `/leader/[groupId]/calendar` — view/edit schedule                                                                | `app/(protected)/leader/[groupId]/calendar/page.tsx`                                                           | Shows _"Schedule incomplete. Contact a ministry admin"_ if cadence unset → blocked on admin.                               |
| Check-ins             | Route exists but **frozen** behind its own `check_ins` gate                                                      | `app/(protected)/leader/[groupId]/checkin/page.tsx`, ADR 0017                                                  | Deliberately off; not an onboarding target right now.                                                                      |

Two facts that shape any plan:

- **The Leader surface is young.** It was re-opened by ADR 0017 and only
  _defaulted on_ by ADR 0024 (migration `20260701020000`). So onboarding at scale
  hasn't been battle-tested — there may be little real usage data yet, which
  itself argues for measurement before redesign.
- **There's already a pattern to copy for "guided setup."** ADR 0027 makes the
  _admin_ Home a "self-dismissing setup workspace" — a setup checklist that
  deep-links to where work lives and reverts to a normal dashboard once complete.
  No equivalent exists for the Leader, and the admin-side checklist doesn't
  surface "you have invited Leaders waiting on group assignment." That ADR is the
  template if we decide to build Leader-side or admin-side guidance.

## Assumptions (label each — correct any that are wrong)

- **[A1]** "Onboarded" means _a Leader reaches the point of doing their core job
  in the app_ (writing a Care Note / managing their calendar), not merely having
  an account. — _load-bearing; if you mean only "has a working login," the target
  is much narrower._
- **[A2]** This is about the **Leader** role specifically, not Over-Shepherds or
  admins. — _the request says Leaders; flag if you meant the whole ladder._
- **[A3]** There is little or no current funnel/analytics on Leader onboarding,
  so we can't yet point to the drop-off. — _I found audit events but no funnel;
  correct me if you already watch this somewhere._
- **[A4]** Check-ins stay out of scope (frozen by ADR 0017). — _safe unless you
  want onboarding to include unfreezing them._
- **[A5]** Volume is real (the README cites 60+ Leaders), so cross-actor handoff
  friction compounds. — _if you're onboarding one or two at a time by hand, goal
  3 matters less._

## Unknowns (what would make this confident)

1. **Where do Leaders actually fall out?** Invite sent → email opened → password
   set → first login → first note. We don't have this funnel.
2. **What's your felt pain?** "Invites don't get accepted" vs. "they log in and
   do nothing" vs. "their space is empty when they arrive" point at goals 1, 2,
   and 3 respectively.
3. **Is email delivery reliable?** (See `docs/architecture/EMAIL_DELIVERY.md`.)
   If invites silently don't arrive, that dwarfs every UX tweak.
4. **How often is a Leader invited _without_ a group assigned?** If common, goal
   3 is the bottleneck by construction.
5. **Is onboarding self-serve or admin-run?** Does Julian personally walk each
   Leader through it today, or are they expected to do it alone? This decides
   whether the fix is in-product guidance or admin tooling.

## Evidence needed

- A **funnel count** from `audit_events`: invites issued vs. `account.*` /
  set-password completions vs. first Care Note authored, over the last 60–90 days.
- A **count of active Leaders with zero `group_leaders` rows** and **groups with
  incomplete schedule fields** — both are one query each and directly size goal 3.
- **Email delivery status** for recent invites (provider logs / the email-delivery
  doc), to rule in/out goal 1.
- Two or three **anecdotes** from Julian about specific Leaders who got stuck and
  _where_.

## Suggested investigation (cheap, read-only, ~half a day)

1. **Run the three counts above** against the live DB (audit funnel; unassigned
   active Leaders; groups with incomplete cadence). This alone likely names the
   target.
2. **Check email-delivery health** for the last batch of invites.
3. **Walk the flow yourself as a fresh Leader** in a non-prod project: invite →
   email → set password → first login _without_ a pre-assigned group, and note
   every dead end. (This will surface the "contact an admin" cul-de-sac viscerally.)
4. **One 15-minute conversation with Julian** on which of the four goals matches
   his lived frustration.

## Recommended next planning target

**Most likely: goal 3 — close the cross-actor onboarding handoff — paired with
lightweight measurement (the audit funnel).** Concretely, that future plan would
probably:

- Surface "invited Leaders waiting on group assignment / schedule" to the admin
  (extending the ADR 0027 setup-checklist pattern), so the Leader's surface is
  _ready before or right when they arrive_; and
- Replace the Leader's dead-end empty/incomplete states with a guided next step
  (and, for the assigned-but-quiet case, a nudge toward writing the first note).

But **don't commit to that yet.** Run the half-day investigation first. If the
funnel shows people falling out at _email_ or _set-password_, the target flips to
goal 1 and the plan looks completely different. The investigation is cheaper than
building the wrong thing.

## Relevant domains (selected deliberately)

```
Selected:
1. Product   — the request is an outcome ("onboarded Leaders"), not a mechanism;
               we must pick which outcome and how we'd know it improved.
2. Data      — the decisive question is "where do Leaders drop off?", and the
               evidence (an audit funnel) doesn't exist yet. This is the gating lens.
3. UX        — there's a real multi-step flow with dead-ends (unassigned empty
               state, "schedule incomplete") to map and smooth.
4. Technical — any fix touches the session/assignment seam (group_leaders,
               assignedGroupIds) and should mirror the ADR 0027 setup-checklist pattern.

Excluded (and why):
- Security    — the invite/auth/RLS surface is mature and audited (ADR 0009/0017);
                onboarding *flow* changes here shouldn't touch authz. Re-include
                only if the chosen target adds a new write path or widens access.
- Database    — no schema change is implied yet; the needed evidence is queries
                over existing tables (audit_events, group_leaders, groups), not
                migrations. Re-include if the plan adds a "leader setup status" field.
- DevOps      — except email-delivery health (a Data/diagnostic question here),
                no infra/CI/deploy change is implied.
- AI / Compliance — nothing model-driven or newly regulated in scope.
- Testing     — applies once we pick a target and define acceptance criteria; not
                useful at the discovery stage with no concrete behavior change yet.
```

## Questions that would materially change direction (pick any; at most these)

1. **Which pain is real for you:** invites not getting accepted (goal 1), Leaders
   logging in and not acting (goal 2), or their space being empty/half-ready when
   they arrive (goal 3)? _This single answer can skip discovery and go straight to
   an implementation plan._
2. **Do you invite Leaders with their group already assigned, or assign later?**
   _If "later," goal 3 is almost certainly the bottleneck._
3. **Is Leader onboarding self-serve, or do you personally walk each one through
   it?** _Decides in-product guidance vs. admin tooling._

If you answer #1, I can turn this brief into a concrete implementation handoff
plan for that specific target in the next pass.

---

## Handoff: how to start the next session

This is a discovery brief, so the immediate next step is the **half-day
investigation**, not implementation. Use this prompt to run it in a fresh session:

```text
Fresh investigation session prompt:

You are gathering evidence to decide which Life Group Leader onboarding
bottleneck to fix. Do NOT implement; produce findings only. This is a
read-only diagnostic pass.

Goal: determine where invited Leaders fall out of onboarding, so a follow-up
session can plan the right fix.

Produce these four findings:
1. Onboarding funnel from audit_events over the last 60-90 days:
   invites issued -> set-password / account.* completions -> first login ->
   first Care Note authored. Report counts and the biggest drop-off.
2. Count of active Leaders (profiles.role in 'leader','co_leader',
   status='active') with zero active group_leaders rows. (The "assigned but
   waiting" population — sizes goal 3.)
3. Count of groups with incomplete meeting cadence (any of meeting_day /
   meeting_frequency / meeting_week_parity null) that have an assigned Leader.
   (The "calendar says contact an admin" population.)
4. Email-delivery health for recent invites (see
   docs/architecture/EMAIL_DELIVERY.md and provider logs): are invites
   actually arriving?

Relevant systems / files:
- Invite: app/(protected)/admin/super-admin/invite-*-actions.ts;
  supabase/functions/invite-user, redeem-invite
- Auth/setup: app/reset-password/**, app/auth/confirm/route.ts,
  app/welcome/page.tsx (ADR 0025)
- Session/assignment: lib/auth/session.ts (assignedGroupIds via group_leaders)
- Leader surface: app/(protected)/leader/** ; components/leader/**,
  components/orientation/first-run-card.tsx
- Patterns to mirror for any guided-setup fix: ADR 0027 (self-dismissing
  setup workspace), ADR 0017/0020/0024/0025.

Constraints (hard): respect all CLAUDE.md security invariants. Reads only —
no select("*"), no direct writes, no migrations, no state-changing commands.
If you query the live DB, read-only queries only.

Output: the four findings above plus a one-line recommendation of which of
these onboarding goals is the real target:
  (1) invite-to-active conversion,
  (2) first-login activation / time-to-value,
  (3) Leader-surface readiness / cross-actor handoff,
  (4) comprehension / role clarity.
Then stop — the fix gets planned in the session after this one.
```
