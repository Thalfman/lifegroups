# Julian Live Review — Prep Playbook

## Purpose

This is the **operator-facing** checklist for Tom: the concrete clicks,
checks, and safe sample data to put in front of Julian when he comes
back into the app. It complements — and does not duplicate — the
engineer-facing QA pass in
[`JULIAN_REVIEW_READINESS_QA.md`](./JULIAN_REVIEW_READINESS_QA.md),
which is the source of truth for what was technically verified
(routes, role access, audit hygiene, privacy column allowlists).

This doc answers the operational question: **"What do I click before
sending Julian back in, so the screens tell a story instead of looking
empty?"**

It is intentionally short and scannable. Sections 5, 6, and 7 are the
ones to actually use on the day.

## Current app status

The Julian-first reviewable spine is merged and reviewable:

- **SC.1A** Shepherd Care Tracker
- **SC.2** Over-Shepherd Coverage Tracking
- **SC.3** Julian Care Dashboard
- **LP.1** Capacity & Launch Planning MVP
- **LP.2** Forecast Scenarios

Plus the legacy admin surfaces Julian already saw: `/admin`,
`/admin/groups`, `/admin/people`, `/admin/check-ins`, `/admin/guests`,
`/admin/follow-ups`, `/admin/calendar`, `/admin/settings`,
`/admin/super-admin`.

**Recommended environment for the review:** staging / demo. Avoid
running this review against production unless Julian has explicitly
approved using real ministry data. Care notes are sensitive.

**Seeded vs. manual today:**

| Surface                              | Seeded? | Needs manual setup? |
| ------------------------------------ | ------- | ------------------- |
| Groups, leaders, members, attendance | Yes (when `supabase/seed/phase2_seed.sql` is applied) | No |
| Follow-ups                           | Yes (8 sample rows from phase 2 seed) | No |
| Launch planning baseline assumptions | Yes (migration default + form merge) | Re-save once to persist |
| Test auth users                      | Scripted (`npm run seed:test-auth`) | Run once if absent |
| Shepherd care profiles / interactions | No | Yes — 1–2 on test leaders |
| Over-shepherds + coverage assignments | No | Yes — 1–2 sample records |
| Forecast scenarios (Conservative / Expected / Stretch) | No | Yes — 3 scenarios |

Whether the phase 2 seed and test users are actually present depends
on what was applied to the target environment. Verify before the
review (see §10).

## What is ready to show Julian

These render meaningfully today (assuming phase 2 seed applied):

- `/admin` — high-level dashboard, attention queue, weekly health
  buckets, capacity tiles.
- `/admin/follow-ups` — page Julian liked; 8 sample rows.
- `/admin/groups` — 5 sample groups with leaders and meeting context.
- `/admin/launch-planning` — baseline assumptions form + summary cards
  + recommendation (renders gracefully even with 0 saved scenarios).

These render meaningfully **after** the manual setup in §5:

- `/admin/shepherd-care` — care dashboard, attention queue, coverage
  buckets, recent interactions.
- `/admin/shepherd-care/[profileId]` — per-shepherd care detail.
- `/admin/shepherd-care/over-shepherds` — over-shepherd roster.
- `/admin/launch-planning` scenarios panel — Conservative / Expected /
  Stretch comparison table.

## What should not be shown yet

See the canonical list in
[`JULIAN_REVIEW_READINESS_QA.md` — "What not to demo yet"](./JULIAN_REVIEW_READINESS_QA.md#what-not-to-demo-yet).
Short version: no leader-facing care surfaces, no over-shepherd login,
no encrypted notes, no public/external flows, no automated reminders,
no AI summaries, no bulk import/export, no "configurable dashboard
builder."

If Julian asks about any of these, frame as "deferred — happy to discuss
priority next."

## Required pre-review manual setup

Run these once, in order, against the staging/demo environment, ideally
60+ minutes before Julian joins. None of these are destructive; all
write paths are narrow `SECURITY DEFINER` RPCs with audit rows.

1. **Confirm test auth users exist.** If they don't, enable via the
   `/admin/super-admin` "Test accounts" panel (super-admin only) or
   `npm run seed:test-auth`. The CLI script requires
   `ENABLE_TEST_AUTH_USERS=true` and (for remote Supabase)
   `ALLOW_TEST_USERS_ON_REMOTE_SUPABASE=true`. See
   [`docs/TEST_AUTH_USERS.md`](../process/TEST_AUTH_USERS.md) for the full
   safety contract.

2. **Sign in as `test.admin@lifegroups.local`** at `/login` in a fresh
   incognito/private window. Confirm you land on `/admin` without an
   Application Error.

3. **Seed 1–2 sample care profiles.** Go to `/admin/shepherd-care` →
   click a test leader (`test.leader1@lifegroups.local` or
   `test.leader2@lifegroups.local`) → use the "Log interaction" form
   with one of the safe sample notes in §6. The care profile row is
   lazily created on first interaction.

   If test leader profiles are not present in the target environment,
   create neutral placeholder leader profiles first or skip this step
   rather than using real leader records. **Never log a sample
   interaction against a real leader row.**

4. **Seed 1–2 sample over-shepherds.** Go to
   `/admin/shepherd-care/over-shepherds` → create over-shepherds using
   clearly fake neutral names such as "Sam Coach" and "Jamie Mentor",
   unless Julian has supplied real over-shepherd names for the review
   environment. Then go back to each test leader's care detail page
   and assign coverage from the coverage form.

5. **Re-save launch planning baseline assumptions.** Open
   `/admin/launch-planning`, scroll to the assumptions form, hit
   **Save** once without changing values. This persists the seeded
   defaults explicitly so the "no saved assumptions yet" banner
   disappears.

6. **Create three forecast scenarios.** Still on `/admin/launch-planning`
   → ScenariosPanel → create three scenarios from baseline using the
   growth deltas in §6. Mark **Expected** as current.

7. **(Optional) Sign in as super_admin and visit `/admin/super-admin`**
   to confirm the audit trail shows the actions you just performed
   with friendly summary strings.

## Suggested safe demo data

**Forecast scenarios (relative to baseline `expected_growth=20`):**

| Scenario     | `expected_growth` | Notes              |
| ------------ | ----------------- | ------------------ |
| Conservative | 10                | Lower-end planning |
| Expected     | 20                | Baseline — mark current |
| Stretch      | 35                | Higher-end planning |

**Over-shepherd names (use only if Julian has not supplied real ones):**
- Sam Coach
- Jamie Mentor

**Safe care-note examples** (copy/paste-ready):
- "Initial check-in completed."
- "Encouragement touchpoint."
- "Follow up next month."
- "Discussed group rhythm and next steps."
- "Check back after next group meeting."

**Avoid in any sample care note:**
- health/medical details
- family details
- conflict details
- counseling details
- spiritual struggle details
- any sensitive pastoral content

**Loud privacy callout:** Never log a sample care interaction against
a real leader's row. Use test leader rows only. Care notes are
RLS-protected and column-allowlisted out of every non-admin reader,
but the underlying value is not encrypted at rest, and the staging /
demo environment is treated as if Julian's actual ministry could see
it.

## Step-by-step walkthrough script

Run this with Julian. The narrative arc is: care today → coverage →
launch planning → follow-ups → close on open questions.

1. Sign in as `test.admin@lifegroups.local`.
2. Open `/admin` — point out the high-level dashboard tiles, attention
   queue, capacity tiles. "This is the same surface you've seen."
3. Navigate to `/admin/shepherd-care`.
4. Walk the **care dashboard**: summary tiles (needs attention,
   overdue, not contacted, unassigned), attention queue, upcoming
   touchpoints, recent interactions, "By over-shepherd" card.
5. Click one **test** shepherd from the attention queue → opens
   `/admin/shepherd-care/[profileId]`. Walk last contact, next
   touchpoint, admin summary, current status.
6. **Log a harmless sample interaction** on the test/shepherd record
   only, using one of the safe notes in §6. Emphasize the note is
   admin-only. (Skip the live entry if Julian doesn't ask to see it.)
7. Back to `/admin/shepherd-care`. Show the **Coverage** filter and
   the "By over-shepherd" card → click "Manage →".
8. Open `/admin/launch-planning`. Walk the assumptions form. Bump
   `expected_growth` briefly to show projected demand, capacity gap,
   and recommended new groups update live. Reset before saving if you
   don't want to leave the change.
9. Walk the **Risk level** badge and recommendation card.
10. Scroll to **Scenarios**. Show Conservative / Expected / Stretch
    side by side. Open Stretch, bump its `expected_growth`, show the
    comparison table updates without changing baseline.
11. Open `/admin/follow-ups`. This is the page Julian said he liked —
    let it sit visible for a moment for him to react.
12. Close by acknowledging **leader tools are deferred** for this
    pass. Pivot to the open questions in §13.

See also the engineer demo script in
[`JULIAN_REVIEW_READINESS_QA.md` — "Recommended demo script for Julian"](./JULIAN_REVIEW_READINESS_QA.md#recommended-demo-script-for-julian)
for the variant that includes the super-admin audit-trail step.

## Accounts to use

- **Primary:** `test.admin@lifegroups.local` (`ministry_admin` role) —
  use for the entire walkthrough. Passwords live only in the Edge
  Function's environment / your local `.env.local`; see
  [`docs/TEST_AUTH_USERS.md`](../process/TEST_AUTH_USERS.md).
- **Optional:** super_admin account — only if showing
  `/admin/super-admin` audit trail at the end. Do this off-screen if
  possible; Julian is `ministry_admin` in the role model.

Do **not** use a real leader account for any part of the walkthrough.

## Routes to open

Use one route per line. Pre-load these as tabs before Julian joins:

- `/admin` — high-level command center
- `/admin/shepherd-care` — care dashboard and directory
- `/admin/shepherd-care/over-shepherds` — over-shepherd roster
- `/admin/launch-planning` — capacity assumptions and scenarios
- `/admin/follow-ups` — page Julian said he liked
- `/admin/groups` — group names, meeting times, capacity context
- `/admin/super-admin` — optional audit / test account check, Tom only

## Data to verify before review

Run through this 30 minutes before the session. If any item fails,
either fix it via §5 or remove that part of the walkthrough rather
than improvise on the call.

- [ ] Login works in an incognito/private window with the exact test
  admin credentials.
- [ ] No Application Error appears after login.
- [ ] `/admin` dashboard tiles show non-zero counts.
- [ ] `/admin/shepherd-care` does not show an empty or confusing first
  screen.
- [ ] At least one shepherd appears in the needs-attention queue.
- [ ] "By over-shepherd" card has at least one tile besides
  "Unassigned".
- [ ] `/admin/launch-planning` summary cards show real numbers (not
  "—").
- [ ] `/admin/launch-planning` has at least one meaningful scenario
  comparison — Conservative / Expected / Stretch all visible
  side-by-side.
- [ ] `/admin/follow-ups` has enough sample rows to show why Julian
  liked it.
- [ ] Sidebar collapses cleanly at narrow widths (drawer on phone) —
  spot-check 390 px and 430 px viewports in dev tools.

## Production caution notes

- This playbook is **intended for staging / demo environments**. Do
  not seed care profiles or interactions against real leader rows in
  production. Do not seed over-shepherds with real coach names without
  Julian's explicit approval.
- `npm run seed:test-auth` honors safety env flags
  (`ENABLE_TEST_AUTH_USERS=true` and, for remote Supabase,
  `ALLOW_TEST_USERS_ON_REMOTE_SUPABASE=true`). Don't bypass those
  flags — see [`docs/TEST_AUTH_USERS.md`](../process/TEST_AUTH_USERS.md).
- Service-role keys remain confined to Supabase Edge Functions and the
  optional Node CLI scripts in `scripts/`. They are never present in
  the Next runtime — see the "No service-role usage in Next runtime"
  bullet in
  [`JULIAN_REVIEW_READINESS_QA.md`](./JULIAN_REVIEW_READINESS_QA.md#audit--privacy-checklist).
- Every write Julian or Tom triggers in the demo writes an
  `audit_events` row in the same transaction. Treat the audit trail as
  the post-review log.

## Rollback notes

After the review, clean up in this order:

- Use `npm run remove:test-auth` only according to
  [`docs/TEST_AUTH_USERS.md`](../process/TEST_AUTH_USERS.md) and the script's
  documented safety flags.
- Soft-archive demo over-shepherds via the edit form on
  `/admin/shepherd-care/over-shepherds/[overShepherdId]` (toggle
  `active=false`; the audit summary reads "Archived over-shepherd …").
- Soft-archive demo forecast scenarios via the ScenariosPanel
  **Archive** button.
- Shepherd care interactions are **append-only by design**. Do not
  hard-delete them through the app. If demo interactions were created
  on test profiles, leave them as harmless test history or clean them
  up only through documented test-data cleanup tooling.
- Do not claim cascade cleanup unless the schema/script explicitly
  supports it.

## Known gaps / questions for Julian

These are the conversations to have during or right after the review
— pulled from
[`JULIAN_FEEDBACK_PIVOT.md §8`](./JULIAN_FEEDBACK_PIVOT.md#8-open-questions-for-next-meeting):

- What fields does Julian's current caring spreadsheet actually
  contain? (We need column names before evolving the care profile
  schema.)
- What does "doing well" vs. "needs attention" mean in his mental
  model — are there obvious status buckets?
- Care cadence: weekly per shepherd, monthly check-in, custom?
- Staleness threshold is currently hard-coded at 60 days
  (`SHEPHERD_CARE_STALE_DAYS`). Should it be configurable, and what's
  Julian's preferred default?
- Should over-shepherds eventually see their assigned shepherds? If
  yes, read-only or edit? Should they see care notes?
- Should leaders ever see any version of their own care status, or
  remain strictly admin-only?
- Should `/admin/follow-ups` integrate with the care notes timeline,
  or stay separate?
- Should forecast scenarios carry notes / comments visible in the
  comparison table?
- For capacity planning: what is the demand model long-term?
- When does Julian want to loop in the communications director?
