# Phase 7.0 — Design refresh: warm-pastoral system + admin port

## Context

Phases 5–6 built the admin command center on a pastoral but ad-hoc
visual system: a single `Inter` typeface, hand-picked terra/sage/mustard
hex values in `lib/pastoral.ts`, and a top-header `PastoralAppShell`
that wrapped every page individually. Phase 7.0 replaces the visual
foundation with a deliberate warm-pastoral system (cream surfaces, sage
primary, clay secondary, status accents) and a left sidebar shell,
ported from the design bundle the team approved on claude.ai/design.

Outcome: a cohesive new visual system across every admin screen,
sharable primitives that later phases can drop into the leader screens,
and zero changes to Supabase / RLS / RPC / migrations / server actions
/ data shapes — this is purely the visual layer + chrome.

## Scope

In scope:

- **Foundation**: design tokens (OKLCH palette + density vars), font
  swap to Newsreader display + Geist body + JetBrains Mono, public
  assets (logo, favicon), shadcn HSL bridge re-pointed to the new
  palette.
- **Primitives** under `components/lg/`: `Icon`, `Pill`, `Button`,
  `Card`, `SectionLabel`, `Avatar`, `SummaryCard`, `PageHeader`,
  `PageBody`, and the pure `healthTone` / `capacityTone` helpers.
- **Sidebar shell**: 232 px left rail (`Wordmark`, grouped nav,
  `Verse` card) + 56 px `TopBar` with user pill + sign-out, wired into
  a new `app/(protected)/admin/layout.tsx`. The legacy `(protected)/
  layout.tsx` session guard is untouched.
- **Mobile drawer**: ≤ 768 px the sidebar hides; a hamburger in the
  top bar opens it as a Radix `Dialog` drawer.
- **Admin dashboard rewrite**: new `DashboardClient` composing six
  `SummaryTiles`, the `AttentionQueue`, `CapacityBuckets`,
  `FollowUpsMini`, `WeeklyHealthBuckets` (7-bucket strip), `SetupGaps`,
  and a restyled `WeekSelector`. Replaces the old
  `components/dashboard/admin/admin-dashboard.tsx` rendering.
- **Every admin route**: the nine pages under `/admin/*` and the
  `[groupId]` nested routes drop their `<PastoralAppShell>` wrapper
  and instead render `<PageHeader>` + `<PageBody>` inside the new
  admin layout shell.

Out of scope:

- **Leader screens**: `/leader`, `/leader/[groupId]/checkin`, etc.
  keep wrapping with the legacy `PastoralAppShell`. They pick up the
  new fonts and shadcn token bridge for free (since `lib/pastoral.ts`
  references `var(--font-display)` and `var(--font-body)`), but their
  chrome itself is untouched.
- **Mock-data variants**: the design bundle ships three dashboard
  variants (Command / Narrative / Metrics-heavy) and two Guests views
  (Pipeline / List). Only the variants chosen in scope (Command +
  list/kanban) are implemented; the alt-mock variants stay in
  `/tmp/design/...`.
- **Persona switcher**: the design's Admin/Leader toggle exists only
  for the prototype demo. The real app routes by role; adding a
  "view as leader" capability is a future feature.
- **Data shapes, RLS, RPC, migrations, server actions**: nothing
  below the visual layer is modified.

## What changed — foundation

### Fonts

`app/layout.tsx` swaps the single `Inter` import for three
`next/font/google` loaders:

- **Newsreader** (display, weights 400/500, italic) →
  `--font-newsreader`
- **Geist** (body sans, weights 400/500/600) → `--font-geist`
- **JetBrains Mono** (400/500) → `--font-jetbrains`

The three `.variable` classes attach to `<html>` so the CSS variables
are available everywhere. `metadata.icons` wires `/favicon.png`.

### Tokens (`app/globals.css`)

Adds the full OKLCH palette as `--c-*` variables matching the design's
`tokens.jsx`:

- **Surfaces**: `--c-bg`, `--c-surface`, `--c-surfaceAlt`,
  `--c-sidebar`, `--c-line`, `--c-lineSoft`
- **Ink**: `--c-ink`, `--c-ink2`, `--c-ink3`, `--c-ink4` (warm-toned
  blacks for text hierarchy)
- **Accents**: `--c-sage`, `--c-sageDeep`, `--c-sageSoft`,
  `--c-sageTint`, `--c-clay`, `--c-claySoft`, `--c-clayTint`
- **Status**: `--c-amber`/Soft, `--c-rose`/Soft, `--c-blue`/Soft
- **Shadows**: `--c-shadow`, `--c-shadowLg`
- **Density**: `--space-card` (20 px), `--space-row` (14 px),
  `--space-gap` (14 px), `--font-scale` (1)
- **Fonts**: `--font-display`, `--font-body`, `--font-sans`,
  `--font-mono`

The shadcn HSL token bridge (`--background`, `--primary`, `--border`,
`--ring`, etc.) is re-pointed at the new palette so any shadcn
component or legacy leader chrome still renders consistently.

### Tailwind (`tailwind.config.ts`)

Extends `theme.colors` with direct CSS-var bindings for every palette
token (`bg`, `surface`, `surfaceAlt`, `sidebar`, `ink`–`ink4`, `sage`/
`sageDeep`/`sageSoft`/`sageTint`, `clay`/`claySoft`/`clayTint`,
`amber`/`amberSoft`, `rose`/`roseSoft`, `blue`/`blueSoft`, `line`,
`lineSoft`). Adds `fontFamily.display` (Newsreader chain), `fontFamily.
sans` (Geist chain), `fontFamily.mono` (JetBrains chain), and
`boxShadow.soft` / `boxShadow.softLg`. The shadcn HSL bindings are
preserved.

### Public assets

Copies `public/logo.png` (32×32 Fox Valley Church mark) and
`public/favicon.png`.

### `lib/auth/roles.ts`

Adds `adminNavGroups(role)` returning a structured
`{ group, label, items[] }[]` for the sidebar:

- **top**: Dashboard ("This week")
- **manage**: People, Groups, Check-ins
- **shepherd**: Guests, Follow-ups, Calendar
- **system**: Settings (+ Super admin for super_admin role)

The legacy `navItemsForRole()` is untouched — it still feeds the
leader chrome's mobile drawer and any other caller.

## What changed — primitives (`components/lg/`)

All TypeScript Server Components except where state is needed
(`Sidebar` / `MobileSidebarTrigger` are client components for the
mobile-drawer state and `usePathname()`):

| File | Purpose |
|---|---|
| `Icon.tsx` | Stroke-icon set with 28 named icons (home, people, groups, check, cal, cog, sun, flag, sprout, star, search, filter, chev, chevD, dots, bell, edit, x, plus, arrow, sparkle, heart, book, logout, inbox, archive, list, grid). |
| `Pill.tsx` | Inline badge — tones: `neutral`, `sage`, `clay`, `amber`, `rose`, `blue`, `ghost`; sizes `sm` / `lg`. |
| `Button.tsx` | Primary action — tones: `sage`, `clay`, `ghost`, `quiet`; sizes `sm` / `md` / `lg`; optional leading icon. |
| `Card.tsx` | Surface card — 14 px radius, `var(--space-card)` padding, soft shadow; `padded={false}` removes padding. |
| `SectionLabel.tsx` | Uppercase eyebrow + optional right-side hint. |
| `Avatar.tsx` | Initials circle; tones `sage` / `clay` / `amber` / `blue`. |
| `SummaryCard.tsx` | Left-edge 2 px tone bar + uppercase label + serif value + optional hint + optional trend. |
| `PageHeader.tsx` | Clay-uppercase eyebrow + serif `h1` (38 px Newsreader) + optional italic accent span + lede paragraph + optional actions slot. Also exports `PageBody`. |
| `tone.ts` | Pure `healthTone(pulse)` and `capacityTone({ members, capacity })` helpers. |

## What changed — sidebar shell

`components/lg/shell/` contains the new app chrome:

- `LgAppShell.tsx` — top-level grid (`232px minmax(0, 1fr)`). The
  sidebar collapses on mobile; main column has the `TopBar` and the
  page content slot.
- `Sidebar.tsx` — 232 px column with `bg: var(--c-sidebar)`. Renders
  `<Wordmark />`, the grouped nav from `adminNavGroups`, and
  `<Verse />` pushed to the bottom via `margin-top: auto`. The active
  item gets `bg: var(--c-surface)`, `border: 1px solid var(--c-line)`,
  and a sage icon.
- `Wordmark.tsx` — `Image` (32×32) + "Life Groups" in Newsreader +
  "Fox Valley Church" eyebrow in caps.
- `Verse.tsx` — sage-tint card with clay uppercase "Why we're here" +
  serif "Telling and *showing* the story of Jesus." + italic
  Colossians 1:28 quote.
- `TopBar.tsx` — 56 px sticky bar with mobile-trigger slot + user
  pill + sign-out button. The search-stub and bell icon from the
  design bundle are omitted (placeholders not yet wired).
- `MobileSidebar.tsx` — hamburger button + Radix `Dialog` drawer
  that re-renders the same `<Sidebar />` inside.

## What changed — admin layout

`app/(protected)/admin/layout.tsx` (new) calls `requireAdmin()` and
renders `<LgAppShell user={…}>{children}</LgAppShell>`. Every admin
`page.tsx` (and the two `[groupId]` nested routes) dropped its
`<PastoralAppShell>` wrapper and now returns `<PageHeader>` +
`<PageBody>` directly — the chrome is provided by the layout above.

## What changed — admin dashboard

`components/lg/admin/dashboard/`:

- `DashboardClient.tsx` — composes the six new sections.
- `SummaryTiles.tsx` — six `SummaryCard` tiles (Active, Submitted,
  Missing, Needs follow-up, Capacity watch, Unknown capacity) with
  tone-correct accent bars.
- `AttentionQueue.tsx` — prioritized list of `AttentionItem` rows,
  each a click-through link to `/admin/check-ins/<groupId>?week=…`.
- `CapacityBuckets.tsx` — Full / Warning / Open / Unknown rows with
  inline progress bar.
- `FollowUpsMini.tsx` — first three open follow-ups with priority
  pills, link out to `/admin/follow-ups`.
- `WeeklyHealthBuckets.tsx` — 7-bucket strip (Submitted, Missing,
  Did-not-meet, Planned-pause, Needs-follow-up, Watch, Healthy);
  every bucket links to `/admin/check-ins?week=…`.
- `SetupGaps.tsx` — aggregated per-group gap list (`Leader`,
  `Capacity`, `Day/time`, `Members`).
- `WeekSelector.tsx` — restyled inline pill with embedded
  `<select>` so it stays a plain GET form (no client-side state, no
  drift from the other server-rendered controls).

The dashboard consumes the exact same `AdminDashboardData` from
`getAdminDashboardData(...)` — no read-model changes, no new RPC.

## What changed — other admin routes

Every other admin route had its `page.tsx` updated:

| Route | Change |
|---|---|
| `/admin/people` | Drops `PastoralAppShell`; renders `PageHeader` + `PageBody` wrapping the existing `<PeopleManagementShell />`. |
| `/admin/groups` | Same — wraps `<GroupManagementShell />`. |
| `/admin/check-ins` | Same — wraps `<CheckInReviewShell />`. |
| `/admin/check-ins/[groupId]` | Same — wraps `<CheckInDetailShell />`. |
| `/admin/guests` | Same — wraps `<GuestsManagementShell />`. |
| `/admin/follow-ups` | Same — wraps `<AdminFollowUpsShell />`. |
| `/admin/calendar` | Drops `PastoralAppShell`; the month-strip card now uses the new `<Card />` primitive; sage-soft active pill style. |
| `/admin/groups/[groupId]/calendar` | Same as above. |
| `/admin/settings` | Wraps `<SettingsShell />`. |
| `/admin/super-admin` | Wraps `<SuperAdminConsoleShell />`. |

The shells themselves still render their existing internal layouts
(`PeopleDirectory`, `GroupManagementShell`, etc.) — they pick up the
new typography automatically because `lib/pastoral.ts` exports
`fontDisplay`/`fontBody` as the CSS variables that are now bound to
Newsreader/Geist.

## Verification

`npm run typecheck`, `npm run lint`, and `npm run build` all pass.

For the manual walkthrough, see [`docs/PHASE_7_0_VERIFICATION.md`](./PHASE_7_0_VERIFICATION.md).
