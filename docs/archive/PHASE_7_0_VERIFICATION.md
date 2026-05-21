# Phase 7.0 — Verification

End-to-end manual checks after the warm-pastoral design refresh.

## Automated

```bash
npm run typecheck
npm run lint
npm run build
```

All three pass with no warnings.

## Routes — admin

Sign in as a `super_admin` (so every admin route is reachable).

- [ ] `/admin` — six summary tiles (Active groups, Submitted check-ins,
  Missing check-ins, Needs follow-up, Capacity watch, Unknown
  capacity) render in a row with the left tone bar. Attention queue
  card + capacity buckets + follow-ups mini side-by-side. Weekly
  health 7-bucket strip. Setup gaps card.
- [ ] Sidebar shows "This week" as the active item (sage icon,
  surface-card background). "Why we're here" verse card sits at the
  bottom of the sidebar.
- [ ] `/admin/people` — `PageHeader` reads "People & placements" with
  a clay uppercase eyebrow. Existing directory + add-new + assignment
  sections render below.
- [ ] `/admin/groups` — `PageHeader` "Groups & lifecycle". Existing
  shell renders below.
- [ ] `/admin/check-ins` — `PageHeader` "Check-ins this week". Existing
  weekly review renders below.
- [ ] `/admin/check-ins/<groupId>?week=…` — detail screen renders
  under the new chrome with `maxWidth=920`.
- [ ] `/admin/guests` — `PageHeader` "Guests & invitations". Guest
  pipeline renders below.
- [ ] `/admin/follow-ups` — `PageHeader` "Follow-ups & care". Open/
  done columns render below.
- [ ] `/admin/calendar` — month-strip card renders with the new
  `<Card>` styling. Active "This month" pill uses sage-soft.
- [ ] `/admin/groups/<groupId>/calendar` — group calendar uses the
  new chrome; archived/active toggle still works.
- [ ] `/admin/settings` — `PageHeader` "Settings & thresholds".
  Existing form sections render below.
- [ ] `/admin/super-admin` — `PageHeader` "Command center". Existing
  panels (checklist, role-change, audit, test accounts) render below.

## Routes — leader

- [ ] `/leader` — still renders through the old `PastoralAppShell`.
  Fonts pick up Newsreader/Geist because `lib/pastoral.ts` exports
  `var(--font-display)` and `var(--font-body)`.
- [ ] `/leader/<groupId>/checkin` — same.

## Visual chrome

- [ ] Sidebar (desktop, ≥ 768 px): 232 px wide, `bg: var(--c-sidebar)`,
  right border `var(--c-line)`. Wordmark at top; grouped nav in the
  middle (Dashboard alone; Manage: People/Groups/Check-ins; Shepherd:
  Guests/Follow-ups/Calendar; System: Settings + Super admin); verse
  card at the bottom.
- [ ] Top bar: 56 px sticky bar with hamburger (mobile only), user
  pill (Avatar + name + role label), sign-out button.
- [ ] Page header: clay uppercase eyebrow, serif `h1`, optional
  italic accent span, body-sans lede.

## Mobile (≤ 768 px)

- [ ] Sidebar disappears.
- [ ] Hamburger icon shows in the top bar.
- [ ] Tapping the hamburger opens a left-edge drawer (Radix dialog
  + overlay) re-rendering the same sidebar content. Tapping a nav
  item closes the drawer.
- [ ] No horizontal scroll on `/admin` or `/admin/groups`.
- [ ] The 6-tile grid on `/admin` reflows to 2 columns; the 7-bucket
  weekly health strip reflows to 2 columns.
- [ ] iOS Safari does not zoom on input focus (16 px font is
  preserved on all `input` / `textarea` / `select`).

## Browser dev-tools spot check

- [ ] The HTML `<html>` has `--font-newsreader`, `--font-geist`, and
  `--font-jetbrains` CSS variables defined (check via the inspector
  on the `<html>` element).
- [ ] `--font-display` resolves to `var(--font-newsreader)` and
  Newsreader is loaded over the network.
- [ ] `--c-bg` resolves to `oklch(0.982 0.008 82)` (warm cream).
- [ ] `:root` has all `--c-*` tokens defined.

## Regression checks

- [ ] No console errors on any admin route.
- [ ] `LogoutButton` still posts to `logoutAction`.
- [ ] The dashboard's `<WeekSelector />` is still a plain GET form
  (changing the week in the dropdown and submitting re-renders the
  server component with the new `?week=` parameter).
- [ ] Active link state in the sidebar follows the path correctly:
  `/admin` matches only the root, while `/admin/people` matches
  `/admin/people` and any deeper sub-route.
