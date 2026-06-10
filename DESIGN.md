---
name: Life Group Operations
description: Warm-pastoral admin OS for shepherding Life Group Leaders (Care · Plan · Multiply)
colors:
  cream-bg: "oklch(0.982 0.008 82)"
  surface: "oklch(0.995 0.004 80)"
  surface-alt: "oklch(0.965 0.012 80)"
  sidebar: "oklch(0.945 0.013 85)"
  line: "oklch(0.89 0.014 82)"
  line-soft: "oklch(0.93 0.012 82)"
  ink: "oklch(0.22 0.02 60)"
  ink-2: "oklch(0.42 0.018 60)"
  ink-3: "oklch(0.58 0.015 60)"
  ink-4: "oklch(0.72 0.012 60)"
  sage: "oklch(0.48 0.07 148)"
  sage-deep: "oklch(0.38 0.07 148)"
  sage-soft: "oklch(0.93 0.04 145)"
  sage-tint: "oklch(0.965 0.022 145)"
  clay: "oklch(0.58 0.12 48)"
  clay-soft: "oklch(0.93 0.045 50)"
  clay-tint: "oklch(0.965 0.022 50)"
  amber: "oklch(0.7 0.13 80)"
  amber-soft: "oklch(0.94 0.045 85)"
  rose: "oklch(0.58 0.13 25)"
  rose-soft: "oklch(0.94 0.04 25)"
  blue: "oklch(0.55 0.08 235)"
  blue-soft: "oklch(0.94 0.025 235)"
typography:
  display:
    fontFamily: "Newsreader, Source Serif 4, Georgia, serif"
    fontSize: "2.375rem"
    fontWeight: 400
    lineHeight: 1.08
    letterSpacing: "-0.5px"
  body:
    fontFamily: "Geist, Inter Tight, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  label:
    fontFamily: "Geist, Inter Tight, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "1.2px"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, Menlo, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  sm: "10px"
  md: "12px"
  lg: "14px"
  pill: "9999px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "20px"
  xl: "28px"
  2xl: "40px"
components:
  button-solid:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    padding: "10px 18px"
  button-terra:
    backgroundColor: "{colors.clay}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    padding: "10px 18px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "10px 18px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "20px"
  badge-sage:
    backgroundColor: "{colors.sage-soft}"
    textColor: "{colors.sage-deep}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
---

## 1. Overview

A well-kept ministry journal, rendered as software. The interface serves a
single non-technical ministry director shepherding dozens of Life Group
Leaders across three jobs — Care · Plan · Multiply. Cream paper surfaces,
warm ink, an editorial serif voice for page titles (often with an italic
accent span), and quiet sage/clay status accents. Register: **product** —
the design serves the task; warmth comes from type, voice, and accent
color, never from decoration. Density is deliberately low: one primary
action per surface, drawer editing for inline changes, progressive
disclosure everywhere.

## 2. Colors: The Warm Pastoral Palette

All colors are OKLCH CSS custom properties in `app/globals.css` (`--c-*`),
mapped to Tailwind utility names in `tailwind.config.ts`. A legacy hex
mirror in `lib/pastoral.ts` (`P.*`) is being retired by aliasing to the
canonical vars.

### Primary

**Clay** `{colors.clay}` is the action color: primary buttons, the page
eyebrow, "needs follow-up" status. **Sage** `{colors.sage}` is the
affirmation color: healthy status, positive trends, selected states.

### Neutral

Cream body (`{colors.cream-bg}`) → off-white cards (`{colors.surface}`) →
alt panels (`{colors.surface-alt}`) → sidebar (`{colors.sidebar}`), with a
four-step warm ink ramp (`ink` → `ink-4`) for text hierarchy and two line
weights for borders/dividers.

### Status vocabulary

sage = doing well · clay = needs follow-up · amber = watch/warning ·
rose = concern/destructive · blue = informational. Each has a `-soft`
background pairing for badges.

### Named Rules

- **The Quiet Page Rule.** Reading a page at rest is calm cream + ink;
  saturated color appears only on the primary action, the current
  selection, and pastoral status signals.
- **The AA Floor.** Body and interactive text pairs must clear 4.5:1.
  (`ink-3` on cream and `clay` on surface historically sat ~4.25:1 — this
  debt is being repaired; do not introduce new sub-AA pairs.)

## 3. Typography

Two families with distinct jobs (serif display + grotesque UI), plus mono
for numerals/IDs.

### Hierarchy

- **Display (Newsreader serif, 400):** page titles ~2.375rem with tight
  1.08 leading and an optional italic ink-2 accent span; card/section
  titles 1.25–1.5rem at 500–600.
- **Body (Geist):** 0.875rem/1.55 default; metadata 0.75–0.8125rem.
- **Labels:** 0.6875rem uppercase, 600, +1.2px tracking — used sparingly
  for form labels and section markers (one per group, not on every
  heading).
- Anything below 0.6875rem is out of bounds (legacy 10–10.5px pill/nav
  text is being raised).

### Named Rules

- **The Serif Speaks Once Rule.** Newsreader carries page and card titles
  only — never buttons, labels, badges, or data.

## 4. Elevation

Flat-by-default. Surfaces separate by background step + 1px line first;
shadow is reserved for true elevation (cards floating on cream, the
editing drawer, menus).

### Shadow Vocabulary

- `soft` — cards at rest: `0 1px 2px rgba(60,45,30,0.04), 0 4px 14px rgba(60,45,30,0.04)`
- `softLg` — drawer/overlay chrome: `0 2px 4px rgba(60,45,30,0.05), 0 12px 32px rgba(60,45,30,0.08)`

### Named Rules

- **Border or Shadow, Not Both.** A 1px line border with a wide soft
  shadow on the same element is the ghost-card tell; pick one.

## 5. Components

### Buttons

Pill-shaped (rounded full), three tones: `solid` (ink), `terra` (clay,
the one primary action per surface), `ghost` (bordered transparent).
Sizes sm/md. Full state vocabulary required: hover, focus-visible (global
ring), active, disabled, busy.

### Chips

Badges/pills carry the status vocabulary on `-soft` backgrounds with deep
foreground of the same hue; pill radius; never below 0.6875rem text.

### Cards

`{components.card}`: surface bg, 1px line border, 14px radius, `soft`
shadow, 20px padding. Tone signals live in the value/heading color or a
leading dot — not colored side-stripes.

### Forms

Uppercase 0.6875rem labels above full-width inputs (10–12px padding, 1px
line border, md radius); auto-fit grid (min 180px) collapsing to one
column on mobile; inputs ≥16px font on mobile (iOS no-zoom guard).
Validation messages inline next to the field they describe.

### Drawer (Editing Surface)

The canonical edit pattern: Radix Dialog as a 460px right-side drawer on
desktop, full-screen sheet ≤767px. Dark warm overlay, focus captured on
open and returned on close, Escape/overlay/× all close. Navigation is for
changing jobs; editing happens in the drawer.

### Navigation

232px sidebar (sticky, sidebar bg, 1px line) with grouped links; active
link = surface bg + line border + ink text + `aria-current="page"`.
Collapses to a drawer behind a hamburger ≤767px. Top bar carries user
pill + sign-out.

## 6. Do's and Don'ts

- **Do** keep one primary (terra) action per surface; demote the rest to
  ghost/subtle.
- **Do** use the drawer for inline edits; **don't** reach for modals or
  page navigation for field changes.
- **Do** let empty states teach the next step in pastoral language;
  **don't** show bare "no data".
- **Don't** use colored side-stripe borders, gradient text, glassmorphism,
  or uppercase tracked eyebrows on every section.
- **Don't** put Newsreader in UI controls, or drop UI text below
  0.6875rem.
- **Don't** introduce new sub-AA color pairs; the contrast carve-out in
  the a11y suite is being retired, not extended.
- **Don't** add new hex literals or new `lib/pastoral.ts` consumers —
  tokens come from `--c-*` via Tailwind names.
