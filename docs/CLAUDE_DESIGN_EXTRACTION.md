# Claude Design Extraction — Life Groups Prototype

> Status: design notes only. This document does **not** authorize code
> changes. Every implementation it references is gated by the strict
> checklist in §9.

## 0. Source

- **Handoff bundle:** `Life Groups Prototype.html` from Claude Design
  (`api.anthropic.com/v1/design/h/IiI7qqYi0tJdui90xc3Qhw`).
- **Bundle contents (read-only reference):**
  - `fvc-life-groups/README.md` — bundle's own guidance.
  - `fvc-life-groups/chats/chat1.md`, `chat2.md` — conversation that
    produced the prototype (chat1: dashboard ideation; chat2: logo
    integration).
  - `fvc-life-groups/project/Life Groups Prototype.html` — entry shell
    (Babel-in-the-browser React, loads `tokens.jsx`, `ui.jsx`,
    `shell.jsx`, and the screen files in sequence).
  - `fvc-life-groups/project/components/tokens.jsx` — token map
    (`LG_TOKENS.applyTokens(mode, density, fontScale)`).
  - `fvc-life-groups/project/components/ui.jsx` — `Icon`, `Pill`,
    `Button`, `Card`, `SectionLabel`, `Avatar`, `healthTone`,
    `capacityTone`.
  - `fvc-life-groups/project/components/shell.jsx` — `Sidebar`,
    `PersonaSwitcher`, `Wordmark`, `Verse`, `TopBar`, `UserPill`,
    `PageHeader`, `PageBody`.
  - `fvc-life-groups/project/components/admin-dashboard.jsx` —
    `SummaryCard` accent-stripe pattern + attention queue.
  - `fvc-life-groups/project/components/leader-screens.jsx` —
    `PillarsRibbon`, `LeaderGroupCard`, quoted-note follow-up card.
  - The remaining `admin-*.jsx` files cover the other admin tabs.
- **Bundle's own framing:** "the design medium is HTML/CSS/JS —
  these are prototypes, not production code. Recreate them
  pixel-perfectly in whatever technology makes sense; don't copy the
  prototype's internal structure unless it happens to fit." This
  document treats the prototype as **inspiration**, not architecture.

---

## 1. Visual principles from the prototype

1. **Warm pastoral palette.** Cream surfaces, sage primary, clay
   secondary, with status tones (amber/rose/blue) used sparingly.
   No pure white, no pure black.
2. **Serif display + sans body pairing.** Newsreader (display) for
   headings and quoted notes; Geist (body) for UI. The serif appears
   in editorial moments (page titles, verse, quoted reasons), the
   sans does all the work.
3. **Italic accent on titles.** Headings combine an upright primary
   word + an italic muted secondary phrase
   (`<h1>Title <em>italic</em></h1>`) — already supported in this
   app via `PastoralAppShell`'s `titleItalic` prop.
4. **Eyebrow labels in clay.** Tiny uppercase labels above headings
   in the clay/terra accent (`fontSize 11px, letter-spacing 2px,
   text-transform uppercase`).
5. **Left accent stripe on summary cards.** A 2px vertical bar in
   the card's tone color, inset 12px from top/bottom, sits flush
   against the card's left edge — quietly tags the metric's tone
   without a full colored background.
6. **Soft warm shadows, not gray.** Shadows tinted with the warm
   ink (`rgba(60, 45, 30, 0.04)`), never neutral gray.
7. **Grouped sidebar nav with section labels.** The prototype groups
   admin nav into "Manage / Shepherd / System" with all-caps
   section labels. The live app uses a horizontal header nav; the
   grouping idea is still useful for visual hierarchy on individual
   route content.
8. **Verse / pillars panels as content moments.** Editorial cards
   ("Why we're here", "Why we gather") sit alongside data — make
   the product feel pastoral, not transactional.

---

## 2. Color, typography, spacing, card, badge, navigation patterns

### Color tokens (prototype, OKLCH) vs live app

| Role            | Prototype `--c-*` (OKLCH)        | Live `lib/pastoral.ts` (P.*)        | Live `app/globals.css` (HSL)        |
|-----------------|----------------------------------|--------------------------------------|--------------------------------------|
| Page bg         | `bg` 0.982 0.008 82              | `P.bg` `#f5ecd9`                     | `--background` 40 45% 98%            |
| Surface         | `surface` 0.995 0.004 80         | `P.surface` `#fbf6e8`                | `--card` 0 0% 100%                   |
| Surface alt     | `surfaceAlt` 0.965 0.012 80      | `P.bgDeep` `#ede0c4`                 | `--muted` 40 25% 94%                 |
| Line            | `line` 0.89 0.014 82             | `P.line` `#e3d4af`                   | `--border` 40 20% 85%                |
| Ink             | `ink` 0.22 0.02 60               | `P.ink` `#3a2a1a`                    | `--foreground` 222 30% 16%           |
| Primary accent  | `sage` 0.48 0.07 148             | `P.sage` `#6a7d4f`                   | `--primary` 154 38% 35%              |
| Secondary       | `clay` 0.58 0.12 48              | `P.terra` `#b85a3c`                  | (none — live uses `P.terra`)         |
| Warning         | `amber` 0.7 0.13 80              | `P.mustard` `#c8964a`                | (none)                               |
| Danger          | `rose` 0.58 0.13 25              | (none — closest: `P.terra`)          | `--destructive` 0 68% 52%            |
| Info            | `blue` 0.55 0.08 235             | (none)                               | (none)                               |

The two palettes are tonally close. **Direct OKLCH→HSL conversion
is not needed for route-scoped polish** — the existing `P.sage`,
`P.terra`, `P.mustard`, and `--background`/`--card` values cover
~80% of the prototype's surface vocabulary. The gaps (`rose`, `blue`,
formal `amber` token) are global additions and belong in §4 (risky)
not §3 (safe).

### Typography (prototype)

- Display: `"Newsreader", "Source Serif 4", Georgia, serif`,
  weight 400, with italic variants used for accents.
- Body: `"Geist", "Inter Tight", -apple-system, system-ui, sans-serif`,
  weight 400/500/600/700.
- Mono: `"JetBrains Mono", ui-monospace, ...`.
- Page H1: `38px * var(--font-scale)`, line-height 1.08,
  letter-spacing `-0.5px`, weight 400.
- Section H2: `20px`, weight 500.
- Eyebrow: `11px`, weight 600, letter-spacing 2px, uppercase, clay.
- Body small / labels: `12.5–13.5px`.
- Pill text: `10.5–11.5px`, weight 500, letter-spacing 0.2px.

### Typography (live)

- Single family: Inter (next/font) wired to `--font-inter`, then
  re-aliased in `app/globals.css` as `--font-sans`, `--font-display`,
  `--font-body`. There is **no serif** loaded.
- Headings get `tracking-tight text-balance` globally
  (`app/globals.css`).
- `PastoralAppShell` already renders title + optional `titleItalic`
  side-by-side — only the serif is missing for the prototype look.

### Spacing / density

- Prototype `--space-row | --space-gap | --space-card`, switched by
  density mode (`spacious 18/18/24`, `balanced 14/14/20`,
  `dense 10/10/16`). Set at runtime via `applyTokens`.
- Live app has no density variable; spacing is inline (e.g.
  `gap: 12`, `padding: 20`) inside `PCard` and dashboard components,
  with mobile overrides via the `lg-m-*` classes in `globals.css`.
- Adopting a density token globally would interact with those mobile
  `!important` overrides — see §4.

### Card pattern

- **Prototype `Card` (`ui.jsx`):**
  `background var(--c-surface); border 1px var(--c-line);
  border-radius 14px; padding var(--space-card) (default 20px);
  box-shadow var(--c-shadow)`.
- **Live `PCard` (`components/pastoral/card.tsx`):** same surface
  + line + radius idea, with `title` + `eyebrow` + `action` slots
  and an optional top accent stripe. Already very close.
- **`MetricCard` (`components/dashboard/cards.tsx:4`):** has a
  bottom or top accent bar already. The prototype's *left* accent
  stripe is a small, additive variant.

### Badge / Pill pattern

- **Prototype `Pill` (`ui.jsx`):** rounded-full (`borderRadius 999`),
  tone-mapped bg/fg/border. Tones: `neutral`, `sage`, `clay`,
  `amber`, `rose`, `blue`, `ghost`. Sizes `sm` (2/8px) and
  `lg` (4/10px).
- **Live `HealthBadge` / `LifecycleBadge` (`components/dashboard/badges.tsx`):**
  tones `"healthy" | "watch" | "followup"`. Smaller catalog, but
  the same shape. `components/ui/badge.tsx` provides a neutral
  base.
- **Tone mapping the prototype uses for health pulse** (verbatim,
  `ui.jsx` `healthTone`):
  - `healthy → sage`, `watch → amber`, `needs_follow_up → rose`,
    `submitted → sage`, `missing → rose`, `did_not_meet → neutral`,
    `planned_pause → blue`, `unknown → ghost`.

### Button pattern

- **Prototype `Button`:** tones `sage | clay | ghost | quiet`,
  sizes `sm | md | lg`, 8px radius, weight 500.
- **Live `PButton` / `PLinkButton`:** tones `solid | terra | ghost`,
  sizes `sm | md`. Identical concept; only the `clay` (=`terra`)
  primary CTA variant is named differently.

### Navigation pattern

- **Prototype:** 232px left sidebar, grouped sections, persona
  switcher, verse footer; sticky 56px top bar with ⌘K search and
  notifications bell + user pill.
- **Live `PastoralAppShell` / `ShellNav`:** horizontal header nav
  with branded seal, a `UserPill` (right) + logout, and a mobile
  drawer with the same items. **Different shell — keep the live
  one.** The prototype's grouped-nav idea can resurface as visual
  groupings *inside route content* (e.g., dashboard sections), not
  as a shell replacement.

### PageHeader pattern

- **Prototype `PageHeader` (`shell.jsx`):** eyebrow + H1 (with
  optional italic secondary) + lede paragraph + actions row +
  children (toolbar / filter row).
- **Live `PastoralAppShell` props:** `eyebrow`, `title`,
  `titleItalic`, `lede`, `actions`. **Already supports the exact
  shape.** This is the single biggest "you already have this"
  finding.

### Summary card with accent stripe (new visual to consider)

`admin-dashboard.jsx` `SummaryCard`: standard card with an absolute
2px vertical bar `{ left: 0, top: 12, bottom: 12, width: 2,
background: toneMap[tone], borderRadius: '0 2px 2px 0' }`. Pairs
with an uppercase label and a large value. **This is the safest new
visual idea in the bundle** — it fits inside an existing `MetricCard`
without touching globals.

---

## 3. Safe to reuse (route-scoped, no globals)

These ideas can be adopted today using only the live tokens, on a
single route, without touching the shell, auth, fonts, or
`app/globals.css`.

- **Eyebrow labels** in clay/terra above page or section titles —
  already supported by `PastoralAppShell` (`eyebrow` prop) and by
  `PCard`'s eyebrow slot.
- **Italic title accents** via the existing `titleItalic` prop on
  `PastoralAppShell` — no font change required; reads well in Inter.
- **`SectionLabel` + right-aligned hint** — a tiny composite
  (uppercase label left, muted hint right). Replicable inline in any
  route file in ~10 lines; reuse on dashboard subsections.
- **Left accent-stripe `SummaryCard`** applied as a variant of
  `MetricCard` (`components/dashboard/cards.tsx:4`). Stripe color
  drawn from existing `P.sage`, `P.terra`, `P.mustard`, or
  `--destructive`.
- **Tone-mapped pills** using existing `HealthBadge` /
  `LifecycleBadge` tones, with light-touch additions limited to
  domain-meaning variants the app already needs.
- **Quoted-note pattern** for follow-up reasons / leader notes —
  small inner card with italic Inter, muted ink, rendered inside
  `PCard`. No new dependencies.
- **Pillars / verse content cards** as additive, route-local content
  (e.g., on `/leader`).
- **Density polish** done locally in component files (tightening
  gaps from 16 → 14 / 12 in a single route) without a global token.

---

## 4. Risky for this app (needs scoping, not in first PR)

- **Newsreader / Geist global swap.** Requires editing
  `app/layout.tsx`'s `next/font` config and likely
  `app/globals.css`'s `--font-display` / `--font-body` aliases.
  Touches every page including `/login`, `/forgot-password`,
  `/unauthorized`.
- **Adding `amber` / `rose` / `blue` status tokens to globals.**
  Would expand `app/globals.css` HSL variables and `tailwind.config.ts`
  color map. Manageable, but it's a global token change — one
  contained PR of its own.
- **Density token system** (`--space-row/gap/card` with a switcher).
  The live app uses inline spacing alongside `lg-m-*` mobile
  overrides marked `!important` in `app/globals.css`. Mixing a new
  global spacing variable here is likely to fight those overrides
  and break mobile.
- **Runtime `applyTokens(mode, density, fontScale)`.** The prototype
  sets CSS variables imperatively at boot. Incompatible with the
  app's SSR + Tailwind + `next/font` model — do not port this
  pattern; if any of its individual outputs are wanted, set them
  statically in `app/globals.css`.
- **Dark mode token set.** `tailwind.config.ts` has `darkMode: ["class"]`
  but **no dark theme is shipped today**. Adopting the prototype's
  dark tokens is a separate, larger initiative.

---

## 5. Do **not** implement directly (high-risk)

These prototype features either touch protected layouts, role
guards, or shared global state. They must not be ported as-is.

- **`PersonaSwitcher` in the sidebar** (`shell.jsx`'s small
  Admin/Leader toggle).  It bypasses `requireAdmin` /
  `requireLeader` (`lib/auth/session.ts`),
  `defaultLandingPathForRole` / `navItemsForRole` (`lib/auth/roles.ts`),
  and the `/admin` vs `/leader` split enforced by
  `app/(protected)/layout.tsx`. **Hard no.** Any "view as" feature
  requires server-side role assertion and is well beyond a polish PR.
- **Replacing `PastoralAppShell` (`components/pastoral/shell.tsx`)
  with the prototype's left-sidebar shell.** Would force every
  `(protected)/**` route through a new shell, replace the mobile
  drawer logic in `components/pastoral/shell-nav.tsx`, and risk
  active-link / role-aware nav regressions. Not in the first PR.
- **Global font swap to Newsreader + Geist.** Touches
  `app/layout.tsx` `next/font` configuration and the global font
  aliases in `app/globals.css`. Not in the first PR.
- **Replacing `components/ui/*` shadcn primitives wholesale.**
  Would ripple into every form, table, dialog, and dropdown in the
  app — including auth and admin operations screens.
- **⌘K omnibar in the top bar.** The prototype's "Search people,
  groups, guests…" bar is decorative; building it for real requires
  a backend search surface across multiple tables and access rules.
- **Notifications bell in the top bar.** Requires a notifications
  model and read/unread state. Not a UI-only change.
- **`tweaks-panel.jsx` / variant switcher.** Design-time only.
- **CDN React + Babel runtime.** Prototype-only artifact.
- **Any sidebar nav restructuring** that bypasses
  `navItemsForRole(role)` (`lib/auth/roles.ts`). Nav items must
  always derive from role.
- **Verse and "Why we gather" wording.** If used, the copy itself
  should be reviewed by leadership before shipping — these are
  pastoral statements with real meaning, not lorem ipsum.

---

## 6. Route-by-route adaptation plan

For each live route, the *Polish moves* column lists only changes
that stay inside that route's page file or a route-local component.
No global, shell, auth, or token changes.

| Live route                                  | Prototype analogue                       | Safe polish moves (route-scoped)                                                                                              |
|---------------------------------------------|-------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------|
| `/admin`                                    | `AdminDashboardCommand`                  | Apply left accent-stripe to `MetricCard` (tone per metric). Tighten attention-queue row gaps. Use `SectionLabel + hint` pattern over each block. |
| `/admin/people`                             | `admin-people`                           | Avatar tone polish (sage/clay variants on `PAvatar`). Role pill row using existing badge tones.                              |
| `/admin/groups`                             | `admin-groups`                           | Lifecycle + health + capacity pill trio per row. Keep existing filter chips.                                                  |
| `/admin/groups/[groupId]/calendar`          | `admin-calendar` (single group)          | Cell tone refinement (gather / off / cancelled) using `P.sage` / `P.mustard` / `P.terra`. No grid restructure.                |
| `/admin/check-ins`                          | `admin-checkins`                         | Status pill alignment (submitted/missing/did_not_meet/planned_pause). Week-selector tightened to match prototype kbd-style.   |
| `/admin/follow-ups`                         | `admin-followups`                        | Priority pill tones (high → terra, normal → mustard). Quoted-note style on the reason text.                                  |
| `/admin/calendar`                           | `admin-calendar` (master)                | Legend styling, eyebrow on filter group. No calendar component rewrite.                                                       |
| `/admin/guests`                             | `admin-guests`                           | Guest stage pill row (inquiry → visited → prayer → followup) with tone mapping. Owner avatar polish.                          |
| `/admin/settings`                           | `admin-settings`                         | `SectionLabel + hint` over each threshold group. No form behavior change.                                                     |
| `/admin/super-admin`                        | `admin-super`                            | **Out of scope** for the polish initiative (super-admin only, audit-leaning UI).                                              |
| `/leader`                                   | `LeaderDashboard` (`PillarsRibbon` + cards) | **Add `PillarsRibbon` hero card above existing `LeaderGroupCard`s.** Polish `LeaderGroupCard` accent + due-date eyebrow.       |
| `/leader/[groupId]/checkin`                 | leader check-in screen                   | `SectionLabel` over each form group. Due-date eyebrow above the title. No field changes.                                      |
| `/leader/[groupId]/calendar`                | leader calendar                          | Cell-state polish; archived-overrides tab eyebrow.                                                                            |

---

## 7. Explicit grouping

### Global design foundation ideas (defer — require globals)

- Adding `amber`, `rose`, `blue` status tokens to `app/globals.css`
  and `tailwind.config.ts`.
- Adding density tokens (`--space-row/gap/card`) and a density
  switcher.
- Serif display font (Newsreader) via `next/font` + global font
  aliases.
- Dark-mode token set.

### Route content polish ideas (safe now, route-scoped)

- `PillarsRibbon` on `/leader`.
- Left accent-stripe variant of `MetricCard` on `/admin`.
- Eyebrow + `titleItalic` use on existing `PastoralAppShell` calls.
- `SectionLabel + hint` rows inside `PCard` bodies.
- Quoted-note styling for follow-up reasons.
- Tone-mapped pills using existing `HealthBadge` / `LifecycleBadge`
  and `P.terra` / `P.sage` / `P.mustard`.

### Unsafe / risky app-shell ideas (block list)

- `PersonaSwitcher` (sidebar persona toggle).
- Replacing `PastoralAppShell` with the left-sidebar shell.
- ⌘K omnibar in the top bar.
- Notifications bell in the top bar.
- Global font swap to Newsreader / Geist.
- Any nav restructuring that bypasses `navItemsForRole(role)`.
- Runtime `applyTokens` pattern.
- Tweaks panel / variant switcher in production.

---

## 8. Recommended first safe implementation target

### Primary recommendation: `/leader` — add a "Pillars" hero card

Add a `PillarsRibbon`-style card at the top of `LeaderDashboard`
(`app/(protected)/leader/page.tsx`), above the existing
`LeaderGroupCard` list. Three pillars (Caring / Teaching / Leading)
in a single `PCard` with an eyebrow ("Why we gather"), each pillar
showing an icon + display-italic word + one-line description.

Why this first:

- **Purely additive.** No existing element changes shape; the card
  is inserted, not modified.
- **One file touched** (the route page) plus optionally one new
  route-local component file under `components/leader/`.
- **No globals, no shell, no fonts, no auth.** Uses only existing
  `P.*` tokens from `lib/pastoral.ts` and existing primitives
  (`PCard`, an inline icon, italic text via inline style).
- **No data dependency.** Static content — no Supabase calls,
  no RPCs, no Edge Functions, no migrations.
- **Easy to revert** (one component, one import, one JSX block).
- **Highest signal-to-risk ratio.** Leader dashboard is where the
  pastoral voice belongs and where the prototype's editorial cards
  pay off most.

### Alternative: `/admin` — left accent-stripe `MetricCard`

If the team prefers an admin-first polish, the smallest second
choice is adding a `tone` prop with a left accent stripe to
`MetricCard` in `components/dashboard/cards.tsx`, and passing tones
from the `/admin` page. This is also single-file in spirit, but
because `MetricCard` is reused elsewhere (`components/dashboard/admin/`)
the diff is wider. Prefer this only if `/leader` polish is
explicitly out of scope.

---

## 9. Strict implementation checklist for future PRs

Every polish PR derived from this document must pass **all** of the
following before review:

1. **Branch:** changes land on a `claude/...` branch, not `main`.
2. **Files NOT touched** (no exceptions in a polish PR):
   - `middleware.ts`
   - `lib/auth/session.ts`, `lib/auth/roles.ts`
   - `app/(protected)/layout.tsx` (and any other protected layout)
   - `app/layout.tsx` (root layout, `next/font` setup)
   - `app/globals.css`
   - `tailwind.config.ts`, `postcss.config.mjs`
   - `lib/pastoral.ts` (token constants — values are frozen)
   - `components/pastoral/shell.tsx`,
     `components/pastoral/shell-nav.tsx`
   - `lib/supabase/**`, `supabase/migrations/**`,
     `supabase/functions/**`
3. **No new top-level providers** (no theme/persona/feature-flag
   providers added under `app/layout.tsx`).
4. **No new fonts** — Inter only until a dedicated font PR is
   approved separately.
5. **No persona / role UI** — no "view as leader/admin" toggles,
   no client-side role swap, no nav items outside
   `navItemsForRole(role)`.
6. **No new search bar, command palette, or notifications surface**
   in the shell or any page header.
7. **No new dependencies** (no `package.json` changes) for visual
   polish alone.
8. **Tokens** come from `lib/pastoral.ts` (`P.*`) or existing CSS
   variables (`--background`, `--card`, `--primary`,
   `--destructive`, etc.). No inline OKLCH or new hex literals
   outside the already-defined palette.
9. **Mobile parity** — the `lg-m-*` mobile overrides in
   `app/globals.css` must still apply unchanged. Verify on a
   ≤375px viewport.
10. **Diff scope** — the visual change is confined to a single
    route (or a single shared dashboard component used by that
    route); the PR title names the route.
11. **No Supabase / RPC / Edge Function changes** in the same PR.
12. **No copy changes to verse, scripture, or pastoral statements**
    without leadership review noted in the PR description.
13. **Revertable in one commit** — implementation can be undone by
    a single `git revert` without leaving dead imports, dead tokens,
    or stranded providers.

If any box cannot be checked, the change does **not** belong in a
polish PR and should be discussed separately.

---

*End of extraction. No code changes follow this document.*
