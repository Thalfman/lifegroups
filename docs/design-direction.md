# Design Direction — The Sharpened Ministry Journal

> Phase 2 of the UI/UX upgrade. This is the proposal the implementation
> slices will execute; it answers the audit (`ui-audit.md`) finding by
> finding. **Approval gate: no implementation begins until this direction
> is approved.** Decisions already locked with the product owner: sharpen
> the existing warm-pastoral identity (not a rebrand); WCAG AA contrast
> with the axe rule re-enabled; one design system with pastoral as a
> variant; deep refactor on live surfaces, token inheritance on frozen
> ones.

## The direction in one paragraph

This app is a **well-kept ministry journal**: cream paper, warm ink, an
editorial serif that speaks once per page, and quiet sage/clay signals
that mean something pastoral. The redesign keeps that soul and executes
it with confidence — ink dark enough to read, type big enough for a
director who isn't a software person, one calm focal point per screen,
and status carried by a small set of deliberate signals instead of
stripes, eyebrows, and eleven identical boxes. Familiar where it should
be familiar (buttons, forms, drawers), distinctive where the brand lives
(the serif voice, the verse, the wordmark, the pastoral copy).

Register: **product** (the design serves the task). The aesthetic bar is
not "would someone say AI made this" but "would Julian trust every
control at a glance."

---

## 1. Color tokens (canonical: `--c-*` OKLCH in `globals.css`)

Same hues, deeper commitments. Every text-role token clears WCAG AA;
measured ratios below (computed sRGB, against cream `--c-bg` unless
noted).

### Ink ramp (text)

| Token      | Current                | Proposed                   | Ratio (was → is) | Role                                                                               |
| ---------- | ---------------------- | -------------------------- | ---------------- | ---------------------------------------------------------------------------------- |
| `--c-ink`  | `oklch(0.22 0.02 60)`  | unchanged                  | 13.9             | headings, primary text                                                             |
| `--c-ink2` | `oklch(0.42 0.018 60)` | unchanged                  | 8.1              | body, ledes                                                                        |
| `--c-ink3` | `oklch(0.58 0.015 60)` | **`oklch(0.52 0.018 60)`** | 4.08 → **5.25**  | metadata, secondary labels                                                         |
| `--c-ink4` | `oklch(0.72 0.012 60)` | **`oklch(0.60 0.015 60)`** | 2.36 → 3.76      | **decorative/disabled only** — never reading text; anything readable moves up-ramp |

### Accents (same hues, committed depth)

| Token                   | Current                | Proposed                    | Ratio (was → is)              | Role                                                       |
| ----------------------- | ---------------------- | --------------------------- | ----------------------------- | ---------------------------------------------------------- |
| `--c-clay`              | `oklch(0.58 0.12 48)`  | **`oklch(0.52 0.115 45)`**  | white-on-clay 4.42 → **5.69** | the one primary action per surface; "needs follow-up"      |
| `--c-clayDeep` _(new)_  | —                      | **`oklch(0.43 0.11 45)`**   | on claySoft 3.58 → **6.79**   | badge/eyebrow foreground on clay tints                     |
| `--c-sage`              | `oklch(0.48 0.07 148)` | **`oklch(0.46 0.075 148)`** | 6.0 → **6.5**                 | affirmation, healthy, selected                             |
| `--c-sageDeep`          | `oklch(0.38 0.07 148)` | **`oklch(0.36 0.07 148)`**  | badge 8.0 → **8.7**           | badge foreground                                           |
| `--c-rose`              | `oklch(0.58 0.13 25)`  | **`oklch(0.52 0.13 25)`**   | on roseSoft 3.72 → **4.80**   | concern, destructive                                       |
| `--c-blue`              | `oklch(0.55 0.08 235)` | **`oklch(0.50 0.085 235)`** | on blueSoft 4.02 → **4.97**   | informational                                              |
| `--c-amberText` _(new)_ | (ad hoc in Pill)       | **`oklch(0.50 0.11 75)`**   | on amberSoft 2.27 → **5.12**  | watch/warning _text_; `--c-amber` stays for non-text marks |

Surfaces (`bg/surface/surfaceAlt/sidebar`), lines, and soft tints are
unchanged — the paper stays; the ink commits.

**Consolidation:** `lib/pastoral.ts` hex exports become aliases of these
vars (`P.terra → var(--c-clay)`, `P.mustard → var(--c-amber*)`,
`P.bg → var(--c-bg)` …), ending the two-creams-on-one-screen drift. The
shadcn HSL bridge stays (it backs the global focus ring) and gets the
same deepening. No new hex literals in components — ever.

### Color rules

- **The Quiet Page Rule.** At rest a page is cream + ink. Saturated color
  appears only on: the primary action, the active selection, and pastoral
  status. If a screen has more than ~10% accent coverage, something is
  decorating.
- **Status vocabulary** (the only meanings color may carry): sage = well
  · clay = needs follow-up · amber = watch · rose = concern · blue =
  info. Soft background + Deep foreground of the same hue, always with a
  text label — never color alone.

## 2. Type scale (fixed rem, ratio ≈1.2 — no fluid clamp)

One UI family (Geist), one display family (Newsreader). Tailwind
`fontSize` tokens replace the 9–14px ad-hoc spread:

| Token       | Size             | Line height | Use                                                                                      |
| ----------- | ---------------- | ----------- | ---------------------------------------------------------------------------------------- |
| `text-2xs`  | 11px / 0.6875rem | 1.35        | the floor: timestamps, dense table meta — sparingly                                      |
| `text-xs`   | 12px / 0.75rem   | 1.4         | badges, helper text, mono figures                                                        |
| `text-sm`   | 13px / 0.8125rem | 1.45        | secondary UI text, table cells, form labels                                              |
| `text-base` | 14px / 0.875rem  | 1.55        | **default body/UI** — buttons, nav links, inputs (16px on mobile via the existing guard) |
| `text-md`   | 15px / 0.9375rem | 1.5         | emphasized body, drawer titles                                                           |
| `text-lg`   | 17px / 1.0625rem | 1.4         | card titles (serif 500)                                                                  |
| `text-xl`   | 20px / 1.25rem   | 1.35        | section headings (serif)                                                                 |
| `text-2xl`  | 24px / 1.5rem    | 1.25        | sub-page headings (serif)                                                                |
| `text-3xl`  | 30px / 1.875rem  | 1.15        | stat figures (serif), mobile page titles                                                 |
| `text-4xl`  | 38px / 2.375rem  | 1.08        | page titles (serif 400, −0.5px tracking, italic accent span allowed)                     |

**Typography rules**

- **The Serif Speaks Once Rule.** Newsreader carries page titles, section
  headings, card titles, and large figures. Never buttons, labels,
  badges, nav, or form text.
- **Nothing readable below 11px.** Pills move 10.5 → 12px; sidebar group
  labels 10 → 11px; nav links 13.5 → 14px; mobile calendar weekdays 9 →
  11px.
- **Uppercase is a spice, not a grammar.** Tracked-uppercase survives in
  exactly three places: the page-header kicker (one per page), form field
  labels (12px, `--c-ink3`), and sidebar group labels. Everywhere else —
  card labels, stat labels, badges — switches to sentence case at
  13px/12px.

## 3. Spacing, radius, elevation, depth, motion

- **Spacing:** Tailwind's 4px scale, with three semantic names kept and
  wired to the existing vars: `p-card` (20px), `gap-gutter` (14px),
  `space-row` (14px). Page gutters: 40px desktop / 16px mobile
  (unchanged). Rhythm rule: sections separate by 32–40px, related items
  by 8–12px — vary the spacing, not the box count.
- **Radius:** `rounded-sm` 10px (inputs, small chips) · `rounded-md` 12px
  (buttons-as-rect, inner panels) · `rounded-lg` 14px (cards, drawer) ·
  `rounded-pill` (pills, the button family). Nothing ≥ 24px anywhere.
- **Elevation — Border _or_ Shadow, Not Both.** Cards on cream: 1px
  `--c-line` border, **no shadow** (the current border+wide-shadow ghost
  combo retires). Shadow is reserved for things that _float_: the editing
  drawer, menus, sticky mobile submit bar (`shadow-softLg`). `surfaceAlt`
  tint (no border) is the third separator for in-card groupings.
- **z-index scale:** `z-base` 1 · `z-sticky` 10 · `z-dropdown` 40 ·
  `z-overlay` 60 · `z-drawer` 61 · `z-toast` 70 — replacing magic numbers.
- **Motion:** 150/200/250ms duration tokens, ease-out. Motion conveys
  state only: hover/press feedback, drawer slide-in (200ms), disclosure
  chevrons (150ms), skeleton pulse. No entrance choreography. Every
  transition honors `prefers-reduced-motion` (instant or crossfade).

## 4. Component conventions

### Buttons (`components/ui/button.tsx` — new, single source)

Pill-shaped, Geist 14px/500, full state vocabulary (the structural win of
leaving inline styles): `hover` deepens bg one step, `active` translates
0.5px down, `focus-visible` global ring, `disabled` 50% + no pointer,
`aria-busy` swaps in a spinner glyph.

| Variant       | Look                      | Use                                                        |
| ------------- | ------------------------- | ---------------------------------------------------------- |
| `primary`     | clay bg, white text       | **exactly one per surface** — the action Julian came to do |
| `solid`       | ink bg, cream text        | strong secondary (e.g. dialog confirm that isn't pastoral) |
| `ghost`       | 1px line border, ink text | secondary actions                                          |
| `subtle`      | surfaceAlt bg, ink2 text  | tertiary / inline row actions                              |
| `destructive` | rose bg, white text       | danger zone & archive confirmations only                   |

Sizes `sm` (8px × 14px padding) and `md` (10px × 18px); icon slot 16px
lucide. `PButton` becomes a thin wrapper mapping its `tone` prop here, so
all 81 call sites upgrade without edits.

### Badges (`components/ui/badge.tsx` — unifies Pill, PBadge, status badges)

Sentence case, 12px/500, pill radius, soft bg + Deep fg + optional
leading 6px dot. One tone map carries the whole status vocabulary; the
three duplicate tone systems re-export from it. Care statuses map:
doing well → sage · needs encouragement → amber · needs follow-up → clay
· concern → rose · inactive → neutral.

### Cards

`bg-surface border border-line rounded-lg p-card` — border, no shadow.
Anatomy varies by content (the anti-identical-grid rule): a stat is a
figure + sentence-case label _inside a shared band_, not its own card;
a list is rows inside one card; a form is fields + one primary action.
**Tone is signaled by a leading dot, a figure color, or a tinted
`surfaceAlt` header strip spanning the full width — never a side/top
stripe.** All 22 detector hits restructure to one of those three moves.

### Forms

Field = 12px uppercase label (`--c-ink3`) → input (full width, 14px text,
10–12px padding, 1px line border, `rounded-sm`, surface bg; focus ring
via the global standard) → 13px helper/error in rose with the message
adjacent to the field. Grid: `auto-fit minmax(180px,1fr)` collapsing to
one column on mobile (responsive variants replace `.lg-m-form-2up`).
Every form card ends with exactly one `primary` button; cancel/back is
`ghost`. The duplicated lede-inside-card copy goes — one instruction,
inside the card.

### Tables & lists

Two patterns, used consistently: **DataList** (stacked rows inside a
card: 14px primary line, 13px ink3 meta line, badge right-aligned, row
`hover:bg-surfaceAlt`, 44px minimum row height) for care/people/groups;
**DataTable** (real `<table>`: 12px sentence-case ink3 header row, 13px
cells, `border-lineSoft` row separators, mono for figures) for the
multiply grid and settings thresholds. Both get an empty state that
teaches ("No follow-ups due — log a touchpoint from a leader's card")
and a skeleton-row loading state (no spinners in content).

### Drawer (Editing Surface — the canonical edit pattern, kept)

460px right drawer desktop / full-screen sheet ≤767px; warm scrim
(`--c-ink` at 45%); slide-in 200ms ease-out (reduced-motion: instant);
focus captured on open, returned on close; Esc/scrim/× close. Header:
serif title + 13px ink3 context line (the tracked eyebrow goes); footer:
primary right, ghost cancel left, sticky on mobile. Progressive
disclosure stays the law: navigation changes jobs, the drawer changes
records, nothing edits in place behind a modal.

### Navigation

Sidebar 232px, sidebar-tint bg: wordmark, grouped links (group labels
11px uppercase ink3), links 14px/500 ink2 with 16px lucide icons,
`hover:bg-surface/60`, active = surface bg + line border + ink 600 +
`aria-current="page"` (unchanged semantics), 36px min hit height. Verse
stays at the sidebar foot — it's brand, not decoration. Mobile: existing
drawer pattern, 16px text, 44px targets. TopBar: breadcrumb-light, user
pill, sign-out — quiet (`surfaceAlt`, no shadow).

### Feedback & states

Every interactive element ships default/hover/focus-visible/active/
disabled; async actions get `aria-busy` + inline result (ErrorBanner for
failures — already good); loading = skeletons matching the layout
(PageSkeleton pattern extends to tab switches); empty states = pastoral
sentence + the one next action.

## 5. The Home screen, specifically (worst audit offender)

The triage queue is the hero and earns the top slot, full width, rebuilt
rows (status dot + sentence + count + "Review →" button that wraps on
mobile — fixing the 375px clipping). Below it: **one** "This week" card
(single label, not three), then **one vital-signs band** — six figures
with sentence-case labels in a single bordered band (2×3 on mobile),
replacing six identical cards. The Overview cluster keeps its
disclosure. Recent Activity becomes one summary row behind the existing
super-admin gate. Net: ~12 phone-screens of boxes → ~4, with one clear
"what do I do next."

## 6. What does not change

Functionality, routes, data flows, server actions, RPCs, RLS. Every
`aria-*`, `role`, `data-testid`, accessible name, and the drawer's focus
contract. The domain voice and pastoral copy. The verse, wordmark, seal,
and paper-grain texture (token-aliased, not flattened). The Admin
Interaction Model (progressive disclosure, drawer editing, one primary
action) — the redesign enforces it harder, not differently.

## 7. Implementation architecture (summary — full sequencing in the approved plan)

Tokens centralize in `tailwind.config.ts` + `globals.css`; components
migrate inline-styles → Tailwind utilities surface-by-surface (each
slice deletes its `.lg-m-*` `!important` block in the same commit);
`lib/pastoral.ts` aliases to canonical vars in slice 0 so unmigrated
surfaces stay coherent mid-flight; the axe `color-contrast` rule flips
to blocking in the final commit. Slice order: foundation → shell/nav →
Home → Care (2) → forms → Plan/Multiply → super-admin → over-shepherd →
auth/hub → leader → frozen-route spot fixes. Gate per slice: lint,
typecheck, unit suite, build, mapped Playwright a11y spec(s).
