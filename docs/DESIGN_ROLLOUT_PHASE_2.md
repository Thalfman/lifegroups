# Design Rollout — Phase 2

## 1. Purpose

PR #45 introduced the new pastoral design foundation (warm tokens, fonts,
sidebar + topbar shell, persona switcher, redesigned `/admin` dashboard).
Most other routes inherit the new shell but their **content layouts** were
intentionally left alone — they kept looking like the old app wrapped in a
new shell.

Phase 2 closes that visible gap on the two highest-impact remaining routes
so the app no longer feels half-converted:

- `/admin/calendar`
- `/admin/super-admin`

The work is strictly visual / content-layout. No new product features,
no auth changes, no schema migrations, no new write paths.

## 2. Routes touched

| Route                | Scope                                  |
| -------------------- | -------------------------------------- |
| `/admin/calendar`    | Page header, filter bar, grid, list, drawer |
| `/admin/super-admin` | Section order, card hierarchy, ops panel polish |

Plus two small additive primitives in
`components/pastoral/primitives.tsx` (`SegmentedControl`, `StatusDot`) so
the same patterns can be reused by future phases without divergence.

## 3. What changed on `/admin/calendar`

**Page chrome** (`app/(protected)/admin/calendar/page.tsx`)
- Month label uses the new display font.
- Prev / This month / Next nav links use surface + line tokens, sit on a
  `Card`-style chrome, and are token-driven rather than `P.*` hex.

**Filter bar** (`components/admin/admin-master-calendar-shell.tsx`)
- Replaced the old "wall of checkboxes" filters with a **compact chip-row**:
  - `Group`, `Type`, `Status` are now **controlled** dropdown chips —
    single open-popover state in the parent so opening one closes any
    other, plus click-outside and Escape close the active one. Summary
    reads `Label · N` so the panel never dominates the page when many
    groups exist.
  - Popover positioning is viewport-aware: if the trigger sits in the
    right half of the viewport, the popover right-aligns instead of
    left-aligning so it never overflows the right edge. `max-width` is
    clamped to `min(320px, calc(100vw - 24px))`.
  - `Day` is a single 7-letter chip row (S M T W T F S), 32px chips on
    desktop / 40px on mobile, all on a 44px / 48px row to meet the
    mobile tap-target minimum.
  - `Leader / co-leader` is a normal-height chip-shaped `<select>` with a
    custom caret. The "stretched panel" feel is gone.
- Filter card is now a `Card` primitive (no inline border / shadow rules).
- Active filters tint sage; reset button only shows when filters are set.
- All chip-style trigger controls are ≥ 36px tall on desktop and
  ≥ 44px tall on mobile (enforced via `lg-m-cal-filter-trigger`,
  `lg-m-cal-day-row`, and `lg-m-cal-day-chip` rules in `app/globals.css`).

**Month / List toggle** (`components/admin/admin-master-calendar-shell.tsx`)
- Replaced the bespoke `ViewToggle` with the shared `SegmentedControl`
  primitive (PersonaSwitcher-style chrome — surfaceAlt tray, surface bg +
  shadow on active).

**Grid** (`components/admin/admin-master-calendar-grid.tsx`)
- Container uses `Card` with `padded={false}` + inner padding.
- Cells use `var(--c-surface)` (in-month) vs `var(--c-surfaceAlt)` (out)
  with lighter `var(--c-lineSoft)` borders.
- Occurrence pills are simpler — neutral chrome with a colored left
  stripe that keeps OFF (neutral) and Cancelled (clay) visually distinct.
  Cancelled titles also get a strikethrough so the distinction is
  legible at the smallest pill size.
- Pill status badge now uses the shared `Pill` primitive.

**List view** (`components/admin/admin-master-calendar-list.tsx`)
- Each date group is a `Card` with an eyebrow date label.
- Occurrence cards use surfaceAlt + lineSoft chrome with a clear
  click-to-open target and tap-target ≥ 44px.
- "Open group calendar →" is now a chip-style ghost link button (still a
  `<Link>`, not a form action). Both `Open group calendar` and `View group`
  affordances remain present.

**Drawer** (`components/admin/admin-master-calendar-drawer.tsx`)
- Overlay tint softened to `rgba(60,45,30,0.38)`.
- Surface uses `var(--c-surface)` with `var(--c-shadowLg)`.
- Header uses display font for the group name and the new pastoral
  eyebrow for the date label.
- Status / type / source badges all use the shared `Pill` primitive at
  size `lg`.
- Close button uses surface + line tokens.
- Footer keeps **both** `View group` (ghost) and `Open group calendar`
  (terra) links. Drawer remains read-first — no inputs, no edit fields,
  no time overrides.

**Empty state** (`shell.tsx`)
- Centered `Card` with eyebrow + body copy instead of dashed border block.

## 4. What changed on `/admin/super-admin`

**Section order and hierarchy** (`components/admin/super-admin-console-shell.tsx`)
- Reordered so operators land on orientation, then diagnostics, then the
  operational standard (test accounts), then the action surfaces:

  ```
  Overview                (orientation)
  Diagnostics             (System status checklist)
  Test accounts           (operational standard — prominent)
  Role management         (action surface)
  Audit trail             (read-only history)
  Feature visibility      (planned, no toggles ship)
  Settings                (planned, links to admin settings)
  Maintenance             (planned)
  Danger Zone             (informational — no destructive tools)
  ```

- Section rail (sticky left nav) was updated to the same order with
  shorter, more scannable labels.

**Card hierarchy**
- Every section now uses the shared `Card` primitive at the section level
  with `var(--c-shadow)` (no nested shadows).
- Inner content cards (Overview metrics, Maintenance placeholders, etc.)
  use the same `Card` so the whole console reads from one chrome.

**Status badges**
- All status pills (`Good` / `Warning` / `Blocked` / `Planned` / `Active`)
  now render through the shared `Pill` primitive, mapped to sage / amber /
  clay / neutral / ghost tones.

**Test accounts panel** (`components/admin/test-accounts-panel.tsx`)
- State dots now use the shared `StatusDot` primitive so the same colored
  dot vocabulary is used in the system status checklist and the
  test-accounts table.
- Card chrome and table chrome rebuilt on tokens (no `P.*` hex constants).
- Operational header pattern (status row + Refresh / Diagnose / Enable /
  Disable buttons) is preserved as the visual standard for future
  operational controls.
- All Edge Function diagnostics rows preserved. No behavior change.

**Owner controls overview** (`components/admin/owner-controls-overview.tsx`)
- Reframed as three "pillar" cards (Audit log, Role management, System
  status) inside the Overview section. The wrapping section header that
  used to live inside this component was removed because the parent
  `CommandSection` already provides one.

**Audit trail** (`components/admin/audit-trail-section.tsx`)
- Wrapped in `Card`; rows separated by `var(--c-lineSoft)` instead of a
  background-stripe trick. Empty / error states converted to token-driven
  `Card` chrome.

**System status checklist** (`components/admin/system-status-checklist.tsx`)
- Each row now reads as: `StatusDot · label + description · Pill status`.
  Same row pattern can be reused by future operational lists.

**Role change form** (`components/admin/forms/role-change-form.tsx`)
- Added a section eyebrow ("Change a role").
- Submit button promoted from terra → solid ink so it reads as the
  primary action of the action surface.
- Width of "New role" select bumped to 180px to fit longer role labels
  cleanly.

**Danger Zone**
- Kept the section header explicitly so operators see that destructive
  tools are absent on purpose. Body copy makes that explicit. **No
  destructive tools shipped in this PR.**

## 5. What intentionally did not change

- No changes to product logic, server actions, RPCs, or Edge Functions.
- No changes to RLS policies, schema migrations, or test-account behavior.
- No changes to route access rules (`super_admin` gating unchanged).
- No new write paths, no hard deletes, no purge tools.
- No Danger Zone tools added.
- No service-role usage introduced in the Next runtime.
- No feature flags, no DB settings, no edit fields on `/admin/calendar`.
- No drag/drop on the master calendar.
- No `start_time` / `end_time` / time overrides exposed.
- No leader-preview, Staff View, admin-preview, demo, or public guest
  forms added.
- `admin_private_note` remains scoped to admin paths.
- Existing `P.*` hex usage in shared atoms (`PBadge`, `PSeal`,
  `POrnament`, `PAvatar`, `PButton`) and the existing `SectionHeader`
  component is kept as-is to bound the diff. New code in the two
  modernized routes uses `var(--c-*)` tokens directly.

## 6. Security and architecture notes

Greps run against this branch:

- `service_role|SERVICE_ROLE|SUPABASE_SERVICE|sb_secret|supabaseAdmin`
  across `app/`, `components/`, `lib/`, `middleware.ts` — only the
  documented test-accounts Edge Function references remain (env-name only,
  no secret values rendered in UI).
- `admin_private_note` — only admin paths read this column. No leader
  paths reference it.
- `Staff View|staff viewer|Staff Viewer` — only legacy `staff_viewer`
  role detection in `/admin/super-admin` (read-only badge); no UI return
  to product surfaces.
- `admin-preview|leader-preview` — none.
- `preview|demo` — none in user-visible routes (only test seed scripts and
  unrelated doc strings).
- `.delete(` — no new occurrences in app/components/lib.
- `.update(` / `.upsert(` — Phase 2 touches no write paths; existing
  writes (check-ins, follow-ups, group calendar overrides, audit RPC
  callers) are unchanged.

The two pages remain server-rendered, RLS-gated, and protected by the
existing `requireAdmin` / `requireSuperAdmin` session helpers.

## 7. Mobile verification checklist

For both `/admin/calendar` and `/admin/super-admin`, verify at 390px
(iPhone 13) and 430px (iPhone 14 Pro Max) widths:

- [ ] No horizontal overflow (page does not scroll sideways).
- [ ] Calendar filter chips wrap onto multiple lines cleanly.
- [ ] Group / Type / Status popovers open within the viewport.
- [ ] Day-of-week chips remain readable (26px circles, tappable).
- [ ] Leader select chip stays inside the filter row.
- [ ] Month / List toggle remains tappable (≥ 44px combined tap area).
- [ ] List view occurrence cards have ≥ 44px tap target.
- [ ] Drawer fits the viewport (max width 92vw, max height 92dvh).
- [ ] Super admin section rail switches to a horizontal scroller
      (existing `lg-super-admin-section-rail` mobile rule).
- [ ] Test-account header buttons wrap and stay tappable.
- [ ] Audit trail and checklist rows stack to a single column.
- [ ] Form inputs have ≥ 16px font on mobile (already enforced globally
      via `app/globals.css` mobile media query).

## 8. Follow-up recommendations

The next design-rollout phase should pick **one or two** of the following,
not all at once:

1. **`/admin/groups` and `/admin/people`** modernization. Highest blast
   radius for admin staff. Re-use the chip-row filter and `Card` patterns
   from Phase 2.
2. **`/admin/guests` and `/admin/follow-ups`** modernization. Pipeline
   stage chips and follow-up status pills are good candidates for the
   shared `Pill` primitive.
3. **`/admin/check-ins`** modernization. The roster row pattern already
   has a mobile rule (`lg-m-roster-row`); the desktop layout could adopt
   the new `Card` chrome.
4. **Leader mobile-first route polish** (`/leader`, `/leader/[id]/calendar`,
   `/leader/[id]/checkin`). Leader paths are mostly mobile; the Phase 2
   chip / pill / card vocabulary applies cleanly there.
5. **Super Admin Command Center feature planning**, as a separate phase
   *after* visual stabilization — feature visibility toggles, owner
   settings via RPC, data-quality validators, audited maintenance.
   Danger Zone tools are explicitly **not** part of that follow-up.

Each follow-up should keep the same constraints as Phase 2: no new
service-role usage, no new write paths, no destructive actions, no route
access changes.
