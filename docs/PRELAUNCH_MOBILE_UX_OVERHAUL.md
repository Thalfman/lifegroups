# Pre-launch Mobile UX Overhaul

A polish pass that makes every leader and admin route comfortable on
screens below 768 px without redesigning desktop, changing the data
model, or touching security boundaries.

## Mobile breakpoint

- **Mobile** = viewport width `≤ 767 px`
- **Desktop** = viewport width `≥ 768 px` (visually unchanged from the
  pre-overhaul state)

All mobile rules live in a single `@media (max-width: 767px) { ... }`
block at the bottom of `app/globals.css`. Outside that block the app is
identical to `main`.

## How the override layer works

The app's existing styling system is inline `style={{...}}` on
"pastoral" components, with `lib/pastoral.ts` providing the tokens. To
avoid rewriting every component, this overhaul adds a layer of
plain-CSS utility classes whose mobile-only rules use `!important`.

CSS rule priority (per spec): inline declarations beat normal stylesheet
rules, but stylesheet rules carrying `!important` beat non-important
inline declarations. None of the existing inline `style={{...}}`
declarations use `!important`, so the mobile classes reliably override
them at `≤ 767 px`. Desktop is unaffected because no rule in the block
applies at `≥ 768 px`.

The class catalog (see `app/globals.css`):

| Class | Effect on mobile (`≤ 767 px`) |
| --- | --- |
| `lg-m-noscrollx` | Outer pages cap at `100vw` and hide horizontal overflow |
| `lg-m-shell-header` | Compact header padding (`12px 14px`), no wrap |
| `lg-m-shell-main` | Compact content padding (`18px 14px`) |
| `lg-m-shell-brand-text` | 14 px brand text with ellipsis |
| `lg-m-shell-title` | 28 px page title |
| `lg-m-shell-titlerow` | Page title row stacks above actions |
| `lg-m-shell-actions` | Action cluster fills width, items flex-grow |
| `lg-m-nav-desktop` | Hides the desktop horizontal nav |
| `lg-m-nav-trigger` | Shows the hamburger button |
| `lg-m-nav-drawer-list` | Drawer list grid layout |
| `lg-m-nav-drawer-link` | Drawer link block: 14 / 16 padding, 16 px font |
| `lg-m-userpill-text` | Hides the inline name + email column in the header |
| `lg-m-signout-hide` | Hides the header sign-out (drawer surfaces it) |
| `lg-m-grid-stack` | Collapses any grid to a single column |
| `lg-m-filterbar` | Collapses filter bars to single column, full-width children |
| `lg-m-form-2up` | Collapses two-up form rows to one column |
| `lg-m-table-scroll` | Adds horizontal scroll fallback for wide tables |
| `lg-m-input` | `width: 100%`, larger padding, 16 px font (kills iOS auto-zoom) |
| `lg-m-roster-row` | Tighter padding for member/follow-up rows |
| `lg-m-attbtn` | 44 × 44 attendance button (Apple HIG min tap target) |
| `lg-m-sticky-submit` | Sticky bottom submit bar inside long forms |
| `lg-m-sticky-spacer` | Reserves bottom space below sticky submit |
| `lg-m-cal-cell` | Calendar day cell: `min-height: 56 px`, tighter padding |
| `lg-m-cal-pill` | Calendar pill: 10 px font |
| `lg-m-cal-weekdays` | Weekday header row: 9 px font |

A global mobile rule inside the same media block sets `font-size: 16px`
on all form `input`s / `textarea`s / `select`s so iOS doesn't auto-zoom
on focus.

## Mobile nav drawer

`components/pastoral/shell-nav.tsx` is a client component. It renders
two nav surfaces side-by-side and the media query flips which is
visible:

- **Desktop (≥ 768 px):** The existing horizontal `<nav>` link list.
- **Mobile (≤ 767 px):** A hamburger button that opens a Radix
  `Dialog` drawer (sliding in from the left). The drawer lists every
  nav item, the user's name / email / role block, and a sign-out
  button. The currently-active route gets a highlight using the
  existing `bestMatchHref` helper.

The drawer is wired in through `PastoralAppShell`'s new `currentUser`
prop (`{ name, email, role }`). Every route that renders the shell
passes its session user so the drawer footer can render the identity
block + sign-out.

The header `LogoutButton` is hidden on mobile by default (the button
defaults to `className="lg-m-signout-hide"`). The drawer renders its
own `<LogoutButton className="" />` so the action is still reachable —
just not crowding the header.

## Routes reviewed

Auth + landing:

- `/`
- `/login`
- `/forgot-password`
- `/reset-password`
- `/unauthorized`

Protected admin:

- `/admin` (dashboard)
- `/admin/people`
- `/admin/groups`
- `/admin/groups/[groupId]/calendar`
- `/admin/settings`
- `/admin/check-ins`
- `/admin/check-ins/[groupId]`
- `/admin/guests`
- `/admin/follow-ups`
- `/admin/super-admin`

Protected leader:

- `/leader`
- `/leader/[groupId]/checkin`
- `/leader/[groupId]/calendar`

Nav labels were also shortened in `lib/auth/roles.ts` (the only change
to that file). Both desktop and mobile see the shorter labels: People,
Groups, Check-ins, Follow-ups, Super admin.

## Desktop preservation

- No inline `style={{...}}` values were changed; only `className`
  pass-through additions and one shell prop (`currentUser`) were added.
- The new CSS rules are all inside `@media (max-width: 767px)` — they
  never match desktop viewports.
- Spot-checked at `768 px` and `1024 px`: header, nav, dashboards,
  admin lists, and calendar grid render identically to `main`.

## Files changed (summary)

CSS:

- `app/globals.css` — adds the mobile media block + class catalog.

Shell + nav:

- `components/pastoral/shell.tsx` — adds `currentUser` prop and wires
  className pass-through.
- `components/pastoral/shell-nav.tsx` — hamburger + drawer.
- `components/auth/user-pill.tsx` — `variant: "header" | "drawer"`.
- `components/auth/logout-button.tsx` — defaults to `lg-m-signout-hide`.

Nav labels:

- `lib/auth/roles.ts` — shortened nav labels (no role logic touched).

Pages (pass `currentUser={{...}}` to `PastoralAppShell`):

- All 13 `PastoralAppShell` callers under `app/(protected)/`.
- `app/page.tsx`, `app/login/page.tsx`, `app/forgot-password/page.tsx`,
  `app/reset-password/page.tsx`, `app/unauthorized/page.tsx` — outer
  wrapper gains `lg-m-noscrollx`.

Dashboards:

- `components/dashboard/admin/admin-dashboard.tsx`
- `components/dashboard/admin/summary-cards.tsx`
- `components/dashboard/leader-group-card.tsx`

Admin shells / directories:

- `components/admin/people-management-shell.tsx`
- `components/admin/people-directory.tsx`
- `components/admin/group-management-shell.tsx`
- `components/admin/groups-directory.tsx`
- `components/admin/group-assignments-section.tsx`
- `components/admin/check-in-review-shell.tsx`
- `components/admin/check-in-detail-shell.tsx`
- `components/admin/settings-shell.tsx`
- `components/admin/audit-trail-section.tsx`
- `components/admin/guests/guests-shell.tsx`
- `components/admin/guests/guest-card.tsx`
- `components/admin/follow-ups/follow-ups-shell.tsx`

Admin forms (collapsed `formGridStyle` grid + assigns/role forms):

- `components/admin/forms/field-styles.ts` (adds two new exported
  string constants)
- `components/admin/forms/{member,leader-profile,group-create,group-edit,metric-defaults,group-metric-overrides,assign-leader,assign-member,role-change}-form.tsx`
- `components/admin/guests/guest-create-form.tsx`
- `components/admin/follow-ups/follow-up-create-form.tsx`

Leader:

- `components/leader/check-in-form.tsx` — sticky submit, larger
  attendance buttons, full-width inputs.

Calendar:

- `components/calendar/calendar-month-grid.tsx`
- `components/calendar/calendar-occurrence-editor.tsx`

Docs:

- `docs/PRELAUNCH_MOBILE_UX_OVERHAUL.md` (this file)

## Files intentionally not changed

- Any `actions.ts` (`app/**/actions.ts`).
- Any RPC name, parameter, or invocation.
- `lib/auth/session.ts`, `middleware.ts`.
- Anything under `lib/admin/**`, `lib/calendar/**`, `lib/dashboard/**`,
  `lib/leader/**`, `lib/supabase/**`, `lib/pastoral.ts`.
- Anything under `types/**` or `supabase/**`.
- `components/admin/follow-ups/follow-ups-shell.tsx`'s
  `admin_private_note` rendering block (lines around 556–574 in the
  pre-overhaul file) — admin-only display untouched.
- Calendar occurrence editor field set: still only status, gathering
  type, title, description. No `start_time` / `end_time` /
  `meeting_day` / `frequency` fields added.

## Manual verification checklist

Use Chrome / Safari dev tools device emulation. Required widths:

- `390 px` (iPhone 12 / 13 / 14)
- `430 px` (iPhone Pro Max)
- `768 px` (tablet, just at the desktop boundary)
- `1024 px` (sanity-check desktop unchanged)

At each width walk every route in the **Routes reviewed** list and
confirm:

- No horizontal scroll.
- Header fits; brand text doesn't overflow.
- Hamburger appears at ≤ 767 px; opens a drawer; ESC + tap-outside
  close it; nav items are tappable; active route is highlighted.
- User identity block + sign-out are reachable inside the drawer.
- Page title / actions row stacks; primary action obvious.
- Forms one-column on mobile; inputs full-width; 16 px font (no iOS
  auto-zoom).
- Tap targets ≥ 44 px on attendance, drawer links, primary buttons.
- Check-in form: submit bar stays visible (sticky); attendance buttons
  do not crowd.
- Calendar grid: 7 columns still legible; pills clickable; editor modal
  collapses status + type to one column.
- Cards stack cleanly (no `260px` grids forcing overflow).
- Filter bars stack vertically; search input full-width.
- Tables-equivalent lists (audit log, settings overrides) are readable.
- Empty / loading / error states still render.

## Role verification

- `ministry_admin` and `super_admin` can use every admin route on
  mobile via the drawer.
- `super_admin` sees the **Super admin** drawer entry (others don't).
- `leader` and `co_leader` see **Home** + **My Groups** only.
- `staff_viewer` (legacy) still routes to `/unauthorized`.
- Members still never sign in.
- Leader pages still scope every read to the leader's
  `assignedGroupIds` (no code path changed).
- `admin_private_note` does not appear on any leader-facing route.

## Known limitations

- The drawer uses Radix `Dialog`. If a future feature opens a second
  modal *while the drawer is open*, focus management between the two
  is up to Radix and should be tested.
- The override layer relies on inline styles never being declared with
  `!important`. If a new component is added with
  `style={{ padding: "0 !important" }}`, mobile overrides for that
  property would not apply.
- The super-admin audit trail list collapses timestamp below the
  event text on mobile — readable but slightly taller per row.
- No native gestures (swipe-to-close on the drawer, pull-to-refresh).
  Standard browser behavior only.

## Verification commands run

```bash
npm run lint        # ✓ no warnings
npm run typecheck   # ✓ no errors
npm run build       # ✓ compiles + generates static pages
```

There is no `npm test` script in `package.json`.

### Security and scope greps (expected results)

```bash
rg -n "service_role|SERVICE_ROLE|SUPABASE_SERVICE|sb_secret|supabaseAdmin" \
  app components lib types supabase
# expected: no application-layer service-role usage

rg -n "admin_private_note" app/\(protected\)/leader components/leader lib/leader
# expected: zero hits

rg -n "Staff View|staff viewer|Staff Viewer" app components lib docs
# expected: zero user-facing hits

rg -n "admin-preview|leader-preview" app components lib docs
# expected: zero hits

rg -n "Phase 5|Phase 6|5A\\.|5B\\.|5C\\.|6\\.0" app components
# expected: zero hits in user-facing strings (docs may still reference)

rg -n "p_start_time|p_end_time|start_time|end_time" \
  app components/leader components/calendar
# expected: not surfaced as user-editable calendar fields
```

If any expected-empty grep returns hits, investigate before merging.
