# Product Definition — the End Product

> **What this is.** The single engineering-reference answer to "what is this
> app supposed to be when it's done?" — audience, features, placement, theme,
> and an honest, dated assessment of how close the current build is. It
> consolidates what is otherwise spread across [`README.md`](../README.md),
> [`PRODUCT.md`](../PRODUCT.md) (brand/design register),
> [`CONTEXT.md`](../CONTEXT.md) (glossary),
> [`design-direction.md`](./design-direction.md) (visual identity),
> [`ui-audit.md`](./ui-audit.md) (UX audit), and the ADRs.
>
> **Precedence.** On any conflict, the ADRs win ([`adr/`](./adr/), currently
> 0001–0034), and [`CONTEXT.md`](../CONTEXT.md) owns vocabulary. This document
> describes; it does not decide.
>
> **Status.** Definition sections (§1–§7) describe the intended end product —
> the landed 2026-06 pivot, fully executed; last trued up against the ADRs
> (group-type model per ADR 0034, Shepherd labels per ADR 0025, Multiply tabs
> per ADR 0030) on **2026-07-03**. §8 is a point-in-time assessment dated
> **2026-07-15** and will age; re-date it when revising.

---

## 1. What this app is

**Julian's admin operating system for shepherding Life Group Leaders** at Fox
Valley Church. One Ministry Admin oversees ~60+ Leaders through a small
oversight ladder; the app's job is to make sure nothing pastoral slips
through: who needs attention, what care was given, which groups are healthy,
and when to launch (multiply) new groups.

The product is **not** a general church-management platform, an analytics
suite, or a member-facing app. Members never log in. A feature is in scope
only if it serves one of Julian's three jobs (his Q12, from
[`julian-inputs/SYSTEMS_CONVERSATION.md`](./julian-inputs/SYSTEMS_CONVERSATION.md)),
which the 2026-06 pivot (ADR
[0016](./adr/0016-pivot-to-care-plan-multiply.md)) mapped 1:1 onto the
navigation spine:

| Julian's job                                   | Area         | Route             |
| ---------------------------------------------- | ------------ | ----------------- |
| Know how my Leaders are doing                  | **Care**     | `/admin/care`     |
| Know who wants to join, and get them placed    | **Plan**     | `/admin/plan`     |
| Know when to launch another group, and of what | **Multiply** | `/admin/multiply` |

Groups and People exist as **management substrate** (the records the three
areas read), and Settings is where Julian configures the pastoral language
and thresholds the areas compute with.

The end product is a tool that **disappears into the shepherding task**:
Julian opens it, sees immediately who needs attention, acts in one or two
clicks (drawer edit, note, follow-up), and trusts both the data and the
privacy model.

## 2. Audience and roles

A strict **downward-visibility oversight ladder** — each tier sees what the
tier below sees, plus more (ADR
[0002](./adr/0002-oversight-ladder-and-leader-gating.md)):

**Super Admin (Tom) ▸ Ministry Admin (Julian) ▸ Over-Shepherd ▸ Shepherd**

| Role                   | `profiles.role`        | Who / usage profile                                                                                                                                                                                                                                                                                     | Lands on         |
| ---------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Super Admin            | `super_admin`          | Tom, the platform owner. Technical. Flags, access, diagnostics, danger zone. Defers pastoral decisions to Julian.                                                                                                                                                                                       | `/admin`         |
| Ministry Admin         | `ministry_admin`       | Julian, the primary persona. Non-technical; short focused sessions, laptop-first with phone use between meetings. Runs all six admin areas.                                                                                                                                                             | `/admin`         |
| Over-Shepherd          | `over_shepherd`        | Three coaches, each covering a set of Leaders. Light, occasional, read-mostly use plus authoring Care Notes / Prayer Requests.                                                                                                                                                                          | `/over-shepherd` |
| Shepherd / Co-Shepherd | `leader` / `co_leader` | Group shepherds (user-facing label per ADR [0025](./adr/0025-rename-leader-label-to-shepherd.md); the code identity stays `leader`). Group-scoped care surface (notes, prayer requests, calendar). **Live by default** since ADR [0024](./adr/0024-default-on-leader-surface-and-groups-people-nav.md). | `/leader`        |
| Member                 | _(none — not a login)_ | Group participants. Non-auth rows in `members`; they appear in rosters and counts but never sign in.                                                                                                                                                                                                    | —                |

Landing paths come from `defaultLandingPathForRole` in `lib/auth/roles.ts`.
The deprecated `staff_viewer` role routes to `/unauthorized` and must not be
expanded. A person's app role is distinct from their role _within_ a group
(`group_memberships.role`).

**Onboarding flow:** an invited person receives a link to
`/invite/[token]`, sets a password, chooses **their own name** at `/welcome`
(ADR [0032](./adr/0032-invitee-chooses-own-name.md) — the inviter never
types it), and lands on their role's surface.

## 3. Information architecture — where things are placed

### 3.1 Navigation spine

The authenticated shell (`components/lg/`, `app/(protected)/admin/layout.tsx`)
is a sidebar app (bottom tab bar on mobile). The admin sidebar order is fixed
(`ADMIN_AREAS` in `lib/auth/roles.ts`):

**Home · Care · Plan · Multiply · Groups · People · Settings**

- Home lights only on exactly `/admin` (never on deeper routes).
- Groups and People are gated by `nav_show_groups` / `nav_show_people` —
  **seeded ON** (ADR 0024); the Super-Admin console can re-hide them.
- The Super Admin Console is reached from the Home Hub tile (Super Admin
  only), not from the sidebar.
- `/` is the **Home Hub** — a role-aware tile launcher; tiles respect the
  same nav flags as the sidebar (`lib/auth/hub-tiles.ts`).

### 3.2 Route table

Every `page.tsx` in `app/`, by status. "Alias" routes render the current
surface and highlight their owning nav area (`lib/nav/active-nav.ts`);
"frozen" routes are pre-pivot surfaces kept resolving but off-nav (ADR
[0009](./adr/0009-runtime-flags-may-reenable-frozen-surfaces.md): a runtime
flag may re-enable them only after a verify-before-flip).

| Route                                                  | Purpose                                              | Access            | Nav status                        |
| ------------------------------------------------------ | ---------------------------------------------------- | ----------------- | --------------------------------- |
| `/`                                                    | Home Hub tile launcher                               | all authenticated | landing                           |
| `/login`, `/forgot-password`, `/reset-password`        | Auth flows                                           | public            | —                                 |
| `/invite/[token]`                                      | Invite acceptance (set password)                     | public link       | —                                 |
| `/welcome`                                             | Invitee names themself (ADR 0032)                    | authenticated     | gate                              |
| `/unauthorized`                                        | No-access explainer                                  | authenticated     | error                             |
| `/admin`                                               | Home dashboard (triage)                              | admins            | visible                           |
| `/admin/care`                                          | Care area (5 tabs, §4.2)                             | admins            | visible                           |
| `/admin/plan`                                          | Plan area — Interest Funnel                          | admins            | visible                           |
| `/admin/multiply`                                      | Multiply area (3 tabs, §4.4)                         | admins            | visible                           |
| `/admin/groups`, `/admin/groups/[groupId]`             | Group management + detail                            | admins            | flag `nav_show_groups`, seeded on |
| `/admin/groups/[groupId]/calendar`                     | Per-group calendar                                   | admins            | via Groups                        |
| `/admin/people`, `/admin/people/[kind]/[personId]`     | People directory + person detail                     | admins            | flag `nav_show_people`, seeded on |
| `/admin/settings`                                      | Julian's configuration (5 tabs, §4.7)                | admins            | visible                           |
| `/admin/super-admin`                                   | Super Admin Console (7 workspaces, §4.8)             | Super Admin       | hub tile                          |
| `/admin/shepherd-care`, `…/[profileId]`                | Leader-care detail host                              | admins            | alias → Care                      |
| `/admin/shepherd-care/over-shepherds`, `…/[id]`        | Over-Shepherd roster + coverage                      | admins            | alias → Care                      |
| `/admin/follow-ups`                                    | Follow-up queue host                                 | admins            | alias → Care                      |
| `/admin/group-health`                                  | Group-health grading host                            | admins            | alias → Care                      |
| `/admin/multiply/criteria`, `/admin/multiply/settings` | Old readiness-config URLs                            | admins            | alias → Settings                  |
| `/admin/leader-pipeline`                               | Apprentice pipeline (re-homed to Multiply ▸ Leaders) | admins            | alias → Multiply                  |
| `/admin/launch-planning`, `/admin/planning`            | Pre-pivot planning surfaces                          | admins            | frozen (`nav_show_planning` off)  |
| `/admin/calendar`                                      | Master calendar                                      | admins            | frozen                            |
| `/admin/guests`                                        | Pre-pivot Guests pipeline                            | admins            | frozen (flag `guests`)            |
| `/admin/check-ins`, `…/[groupId]`                      | Check-in review                                      | admins            | frozen (flag `check_ins`)         |
| `/over-shepherd`, `/over-shepherd/[profileId]`         | Coverage-scoped Care surface                         | Over-Shepherd     | role landing                      |
| `/leader`                                              | Leader's groups                                      | Leader/Co-Leader  | flag `leader_surface`, seeded on  |
| `/leader/[groupId]/care`                               | Group-scoped Care Notes + Prayer Requests            | Leader/Co-Leader  | via `/leader`                     |
| `/leader/[groupId]/calendar`                           | Group calendar (leader view)                         | Leader/Co-Leader  | via `/leader`                     |
| `/leader/[groupId]/checkin`                            | Check-in entry                                       | Leader/Co-Leader  | frozen (flag `check_ins`)         |
| `/a11y-harness`                                        | Playwright/axe test harness                          | test builds       | —                                 |

### 3.3 Feature-flag registry

Runtime switches live in `feature_flags` and are typed in
`lib/admin/feature-flags.ts`; the Super Admin Console ▸ Config workspace is
the only UI that flips them. Frozen-surface flags require
**verify-before-flip** (ADR 0009).

| Flag                                                           | Gates                                      | Default       |
| -------------------------------------------------------------- | ------------------------------------------ | ------------- |
| `leader_surface`                                               | The whole `/leader` surface                | on (ADR 0024) |
| `check_ins`                                                    | Check-in entry + review (leader and admin) | off (frozen)  |
| `guests`                                                       | The pre-pivot `/admin/guests` surface      | off (frozen)  |
| `nav_show_groups`, `nav_show_people`, `nav_show_planning`      | Sidebar/hub visibility of those areas      | on, on, off   |
| `mute_care_attention`, `mute_health_checks`, `mute_follow_ups` | Mute Needs-Attention categories on Home    | off           |
| `home_hub_welcome_banner`                                      | Home Hub welcome banner                    | —             |
| `care_member_list`                                             | Member list inside the Care surface        | —             |
| `usage_tracking`                                               | Usage metrics collection                   | —             |

## 4. Feature inventory — what's available and how it's used

Each surface follows the same construction: a thin async server page guards
auth and loads data, then hands a typed shape to a `"use client"` shell.
Writes are server actions (`app/**/actions.ts`) running the
validate → guard → `SECURITY DEFINER` RPC → revalidate → log pipeline, each
RPC writing a paired `audit_events` row.

### 4.1 Home dashboard — `/admin`

The triage surface. Julian opens here and answers "who needs me today?"

- **Needs Attention** — bucketed queue: groups with no Leader, launching
  groups with setup gaps, Leaders with overdue follow-ups. Each bucket can be
  muted via the `mute_*` flags; muted buckets disappear rather than show
  zero. A period selector (`?period=`) pivots the window.
- **This Week / Vital Signs** — capacity summary (at / near / under),
  health-grade distribution, attendance parity for bi-weekly groups.
- **Hub stat tiles** linking into Care / Plan / Multiply with their headline
  counts.
- **No-credentials preview** — without Supabase env vars the page renders
  deterministic demo data (`lib/dashboard/demo-seed.ts`) through the real
  model assembler; degraded live reads instead show an error banner and
  suppress derived numbers (never a false zero).

### 4.2 Care — `/admin/care`

The shepherding center: one place to see every Leader's pastoral state.
Five tabs (`components/admin/care/care-shell.tsx`; legacy tab keys normalize
onto these):

1. **Over-Shepherds** _(default)_ — accordion grouped by Over-Shepherd:
   their covered Leaders with status badges, health grades, and last-care
   timestamps; an Unassigned pane on top.
2. **All leaders** — summary cards + the **Care Attention Queue** (ranked by
   overdue follow-ups, contact recency, health), then the flat roster with
   needs-attention filter chips. One tab to scan and act.
3. **Follow-ups** — two clearly-labelled queues: care follow-ups (about
   Leaders; due-soon and completed) and the general oversight queue (groups
   and tasks).
4. **Recent updates** — the cross-leader feed of logged calls, notes, and
   meetings ("update of communication" from Julian's spreadsheet).
5. **Notes** — the **All Notes feed** (ADR
   [0023](./adr/0023-all-notes-feed-and-admin-authorship.md)): every Care
   Note / Prayer Request / broad note the viewer may read, newest first,
   plus presence-only counts of sealed notes with the inline transparency
   toggle.

Drilling into a Leader (alias host `/admin/shepherd-care/[profileId]`)
opens the per-Leader panel: care status, grades, note/prayer history,
follow-ups, and — Ministry Admin only — the **Private Care Note**
(client-side encrypted; see §6).

Key actions (`app/(protected)/admin/shepherd-care/actions.ts`): upsert care
profile, log interaction, create/update/archive follow-ups, manage
Over-Shepherds and coverage, author Care Notes / Prayer Requests (ADR 0023),
flip per-person note transparency, and manage Private-Care-Note encryption
keys.

### 4.3 Plan — `/admin/plan`

The **Interest Funnel**: getting interested people into groups.

- **Intake form** — only a name is required; optional contact info and a
  Desired group type (ADR 0034).
- **Funnel board** — four color-coded Prospect states: **Interested**
  (yellow) → **Matched** (blue, requires a group) → **Joined** (sage;
  collapses into a roll-up and leaves the active board), plus **Not at this
  time** (orange parking lot — a state, distinct from archiving).
- **Next step per Prospect** — type, due date, note; overdue next steps
  surface in clay/rose. Follow-ups are armed here; actually sending messages
  is out of scope (provider-deferred).

Actions (`app/(protected)/admin/plan/actions.ts`): create, transition
(state machine validates a group for Matched/Joined), update, set next step,
archive.

### 4.4 Multiply — `/admin/multiply`

The launch-decision area (ADR
[0019](./adr/0019-multiplication-by-type-and-pillars.md),
[0021](./adr/0021-three-tier-multiplication-trigger.md),
[0022](./adr/0022-multiply-unifies-plan-readiness-leaders.md); the cell model
collapsed to group types by ADR
[0034](./adr/0034-collapse-cells-to-group-type-list.md), and the tab set
renamed/reordered by ADR
[0030](./adr/0030-multiply-readiness-first-and-type-intent-pipeline.md)).
Three tabs, deep-linkable via `?tab=`:

1. **Readiness** _(default)_ — the per-**group-type** readiness view. Each
   type shows its four **pillars**, each in its natural unit: **Interest** (a
   count of matching Prospects — never a letter), **Capacity** (a derived
   issue/no-issue signal: any group over 12 members, or ≤ 1 joinable group),
   **Group Health** (A–F roll-up), **Leader Health** (A–F roll-up). The
   configured trigger turns pillars into a per-type readiness signal; the
   app surfaces the signal, Julian decides.
2. **Pipeline** _(renamed from Plan by ADR 0030)_ — the working list of group
   types Julian intends to multiply, each over its Multiplication Candidates
   and the per-group multiplication plan seeded from Julian's 2026 doc:
   target year, successor, apprentice, readiness chips.
3. **Shepherds** _(renamed from Leaders)_ — the apprentice pipeline: who
   could lead the next group, with development stage and readiness.

Multiply is read/decide; its configuration lives in Settings (§4.7).

### 4.5 Groups — `/admin/groups`

Management substrate (back in nav per ADR 0024). Card/table list where each
group carries four independent statuses: **Lifecycle** (Active / Launching /
Closed / Archived), **Setup** (complete vs. gaps), **Health Grade** (A–F),
**Capacity** (vs. the 12-member cap). Detail pages cover setup, roster,
health history, follow-ups, and the group calendar. Actions: create, update,
close, reopen — archive is the only way a group leaves a surface.

### 4.6 People — `/admin/people`

The person directory across kinds (`/admin/people/[kind]/[personId]` for
leader / member / prospect), plus the apprentice pipeline and a
needs-contact view. Actions (`app/(protected)/admin/people/actions.ts`):
create Leader profiles and members, assign/unassign group roles, end
memberships, deactivate, promote/demote leader ↔ co-leader. Roster data
entry stays deliberately light — Julian maintains some assignment work
off-app (ADR 0016).

### 4.7 Settings — `/admin/settings`

**Julian's pastoral configuration** (his language and thresholds — owned
here, not in the Super Admin Console). Five tabs
(`components/admin/settings-shell.tsx`):

1. **Care** — care statuses, cadence windows, care-surface configuration.
2. **Groups** — _creates_ group types: free-text names on the admin-managed
   list, plus each type's tracking target (`group_type_configs`; ADR 0034).
3. **Multiply** — _configures the Multiplication Trigger_: per pillar,
   required or not, threshold in the pillar's natural unit, resolved as
   **global rule → optional per-type override** (ADR 0034 collapsed ADR
   0021's three-tier cascade).
4. **Thresholds** — metric defaults: the 12-member capacity cap, attendance
   parity, dashboard attention windows.
5. **System** — the remaining app-level toggles appropriate for an admin.

Also hosts the **Health Rubric** editors (ADR
[0018](./adr/0018-configurable-af-health-rubrics.md)): Group-Health and
Leader-Health are separate A–F rubrics of weighted criteria totalling 100,
tracked within the Ministry Year (Aug–May). Grades are computed, fluid, and
defined in Julian's own words (placeholder labels shipped first per ADR
0007).

### 4.8 Super Admin Console — `/admin/super-admin`

**Tom's platform console** — app administration, never pastoral content. Seven
workspaces (`components/admin/super-admin-console-shell.tsx`), hash-deep-linkable:

1. **Readiness** — is the platform ready; the one next thing to do.
2. **Access** — profiles and roles (self-change and super-admin grants
   blocked), invites, coverage assignment.
3. **Config** — the feature-flag registry (§3.3) with verify-before-flip on
   frozen surfaces.
4. **Diagnostics** — health checks and test tooling.
5. **Audit** — the `audit_events` trail of every mutation.
6. **Usage** — bounded product-usage metrics when `usage_tracking` is enabled.
7. **Danger Zone** — the only place permanent deletion exists: type-to-
   confirm, impact preview, and an audited tombstone, never cascading. Non-
   profile tombstones retain a recovery snapshot; profile-erasure tombstones
   retain only structural/status metadata and are irreversible.

### 4.9 Over-Shepherd surface — `/over-shepherd`

Coverage-scoped (RLS keeps each Over-Shepherd to their own Leaders, ADR
[0017](./adr/0017-reopen-leader-os-logins-and-care-notes.md)): a roster of
covered Leaders (groups, health grade, last care action), drill-down per
Leader, and authoring of Care Notes / Prayer Requests about them —
author-private until Julian flips that Over-Shepherd's transparency toggle.

### 4.10 Leader surface — `/leader`

Group-scoped and live by default (ADR 0024). The landing page lists the
groups the Leader leads, each linking to:

- `/leader/[groupId]/care` — group-scoped Care Notes and Prayer Requests
  (about the group as a whole, **not** per-member — ADR
  [0020](./adr/0020-leader-care-note-is-group-scoped.md)), sealed to the
  author until the transparency toggle flips.
- `/leader/[groupId]/calendar` — the group's calendar.
- `/leader/[groupId]/checkin` — attendance check-in entry, behind the
  separate `check_ins` gate (stays frozen).

Leaders never see roster-management UI or any `admin_private_note` content.

## 5. Theme and design language

The identity is a **well-kept ministry journal** — "cream paper, warm ink,
an editorial serif that speaks once per page, and quiet sage/clay signals
that mean something pastoral" ([`design-direction.md`](./design-direction.md),
register and anti-references in [`PRODUCT.md`](../PRODUCT.md)). It is
deliberately not a SaaS dashboard, not BI-dense, not gamified.

**Rules the end product holds to:**

- **Quiet Page** — at rest a page is cream + ink; saturated color appears
  only on the primary action, the active selection, and pastoral status
  (≤ ~10% accent coverage).
- **Serif Speaks Once** — Newsreader carries titles, headings, and large
  figures; never buttons, labels, badges, nav, or form text.
- **One primary action per surface**; everything else secondary or
  disclosed.
- **Progressive disclosure** — navigation changes jobs; the right-side
  drawer (full-screen sheet on mobile) changes records; nothing edits
  behind a modal.
- **Status color vocabulary** (the only meanings color carries, always with
  a text label): sage = well · clay = needs follow-up · amber = watch ·
  rose = concern · blue = info.

**Tokens** (`app/globals.css`, OKLCH; bridged into `tailwind.config.ts`):
cream surfaces (`--c-bg`, `--c-surface`, `--c-surfaceAlt`, `--c-sidebar`),
a four-step warm ink ramp (`--c-ink` … `--c-ink4`), and
soft/tint/deep ramps per status hue (`--c-sage*`, `--c-clay*`, plus rose,
amber, blue).

**Typography:** Newsreader (display serif) · Geist (UI sans) · JetBrains
Mono. Fixed rem scale with **11px as the readable floor**; 14px default UI
size. **No dark mode** — the warm-paper identity is light-only.
**Mobile:** one breakpoint at 767px with dedicated `.lg-m-*` helpers
(16px inputs for the iOS no-zoom guard, stacked grids, sticky submit).
`prefers-reduced-motion` is honored globally. WCAG 2.1 AA is the floor
(see §8 for the current carve-out).

**Branding:** metadata title "Fox Valley Church Life Groups"
(`app/layout.tsx`); the shell shows "Life Groups". No logo — institutional,
not commercial. The login page keeps a verse as the brand voice.

## 6. Privacy and visibility model

The downward ladder (§2) governs all reads, enforced by Postgres RLS, with
exactly **two deliberate exceptions**:

1. **Private Care Note** — the Ministry Admin's own pastoral note per
   Leader, hidden even from the Super Admin (ADR
   [0003](./adr/0003-private-care-note-encryption.md)): client-side
   encrypted (AES-256-GCM, WebAuthn-held keys + recovery code), so the
   server stores only ciphertext. Never exposed to any other tier.
2. **Author-private Care Notes / Prayer Requests** — a note written down
   the ladder (Over-Shepherd about a Leader, Leader about their group) is
   sealed to its author until the Ministry Admin flips that **person's
   transparency toggle** (`set_note_transparency_grant`); once flipped, the
   normal ladder applies (the Super Admin can read too). Sealed notes
   appear to admins only as presence counts.

Around the exceptions, the integrity model: every write goes through a
narrow `SECURITY DEFINER` RPC with a paired `audit_events` row in the same
transaction; **archive is the default exit** (soft, reversible) and
permanent deletion exists only in the Super-Admin Danger Zone with a
tombstone; authorization is by `profiles.role` only — no hardcoded people.
Full read matrix: [`architecture/RLS_VISIBILITY.md`](./architecture/RLS_VISIBILITY.md).

## 7. End state vs. transitional vs. legacy

**The end product is** §1–§6: the three-area spine plus Groups/People/
Settings for admins, the Over-Shepherd and Leader care surfaces, the Super
Admin Console, the journal theme, and the two-exception privacy model.

**Transitional (frozen, not deleted)** — pre-pivot surfaces that still
resolve by URL, off-nav, each behind ADR 0009's verify-before-flip if it is
ever to return: `/admin/planning`, `/admin/launch-planning`,
`/admin/calendar`, `/admin/guests`, `/admin/check-ins` (+ the leader
check-in entry), and the Health Pulse that check-ins feed. They are kept as
history and optionality, not as part of the end product; if one returns it
gets re-decided in an ADR first.

**Legacy (deliberately retired)** — kept only for compatibility, never to
be expanded: the `staff_viewer` role; the `life_stage` enum (replaced by
free-text Categories); the fed capacity model (capacity is now derived);
per-member care notes (the Leader's Care Note is group-scoped, ADR 0020);
inviter-typed names (ADR 0025).

## 8. Current-state assessment — 2026-07

_How user-friendly is it, and is it cohesive or confusing? Evidence-based
snapshot; the structural source is [`ui-audit.md`](./ui-audit.md) (Nielsen
heuristic score **25/40**, since remediated — see below) and the approved
remediation direction is [`design-direction.md`](./design-direction.md),
executed in the 2026-06 implementation slices and closed out by #847/#908._

### Where it is cohesive

- **Vocabulary discipline.** The live areas consistently use the CONTEXT.md
  language (Shepherd, Over-Shepherd, Prospect, Interest Funnel, Group type,
  Archive). Copy is pastoral and honest ("The week ahead is clear", not
  "No items").
- **One interaction grammar.** Thin page + client shell everywhere; one
  form-state hook (`components/admin/forms/action-form.tsx`); the same
  ARIA tab pattern on Care/Multiply/Settings/People; drawer editing with
  focus capture/return.
- **Honest degradation.** Failed reads suppress derived output instead of
  reporting false zeros; tab badges are omitted rather than wrong; each
  Multiply tab degrades independently.
- **The privacy model holds in the UI.** Sealed notes render as presence
  counts; the transparency toggle is inline where the decision is made;
  the Private Care Note never leaves the Ministry Admin's view.
- **Strong, distinctive identity.** The journal theme is consistently
  recognizable and nothing like a default SaaS dashboard.
- **One design system.** The 2026-06 ui-audit P1 debt is paid: one button
  kit (`components/ui/button.tsx`; PButton retired), one color vocabulary
  (the OKLCH `--c-*` tokens — the shadcn HSL bridge and `lib/pastoral.ts`
  hex are gone, per #908/#847), ink/accent ramps that clear WCAG AA with
  the axe `color-contrast` rule blocking (the old carve-out in
  `tests/a11y/harness.ts` is removed), an 11px type floor, and inline
  styles reduced to a fitness-enforced allowlist of genuinely dynamic
  values (`tests/fitness/no-inline-style-sprawl.test.ts`).

### Where it is confusing or falls short

- **Legacy vocabulary echo (reduced).** Frozen routes reachable by URL
  still say "Guests" and "check-in" while the live product says Prospect /
  Interest Funnel, though they now carry frozen-surface notices pointing at
  the live replacement where one exists (#901); internal `shepherd-care`
  paths still mislead contributors about role names (deliberate — code
  identity stays `leader`/`co_leader` per ADR 0025).
- **Home is a wall on mobile.** Identical stat tiles produce ~12 screens of
  scrolling at 375px, and the Needs-Attention "review →" affordance clips.
- **Duplicate entry points.** Over-Shepherd coverage is manageable both in
  the Super Admin Console and via the Care-area alias host; grades show no
  "why this grade?" trace from the badge.

### Net judgment and the gap to the end state

The product is **cohesive in structure, vocabulary, and behavior** — the
three-job spine genuinely matches how Julian works, and the privacy model
is both unusual and consistently executed. The remediation order the
2026-06 assessment prescribed has been worked through:

1. ~~Land the [`design-direction.md`](./design-direction.md) execution~~ —
   **done** (#847 landed the token deepening, 11px floor, one button
   system, and the Tailwind migration; #908 removed the last duplicate
   color vocabulary, the shadcn HSL bridge). Fitness tests keep the sprawl
   and the retired systems from regrowing.
2. ~~Add the missing first-run orientation~~ — **done** (#906 expanded the
   first-run card into concept orientation for Shepherds and
   Over-Shepherds).
3. Tidy the echo — **partly done** (frozen surfaces carry "this moved"
   notices, #901); one canonical coverage entry point and a
   grade-explanation affordance remain open.

What remains is polish (the mobile Home wall, the coverage/grade items
above), not conceptual repair. None of it changes the definition in §1–§7;
it makes the build match it.
