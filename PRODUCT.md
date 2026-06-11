# Product

> Brand/design register. For the full end-product definition — feature
> inventory, placement (routes/nav/flags), privacy model, and the dated
> current-state assessment — see
> [`docs/PRODUCT_DEFINITION.md`](./docs/PRODUCT_DEFINITION.md).

## Register

product

## Users

- **Julian — Ministry Admin** (primary). A non-technical ministry director
  who runs the operating system day to day: reviewing Leader care, working
  the Interest Funnel, and planning group multiplication. He works in
  short, focused sessions between pastoral conversations — often on a
  laptop at a desk, sometimes on a phone between meetings. Clarity beats
  density on every screen.
- **Tom — Super Admin** (platform owner). Technical; uses the Super Admin
  Console for platform/account administration, flags, and the danger zone.
- **Over-Shepherds**. Coaches who log in to a coverage-scoped Care surface
  over the Leaders they cover. Light, occasional use; read-mostly.
- **Leaders / Co-Leaders** (live by default, ADR 0024). A group-scoped Care
  surface (Care Notes + Prayer Requests + group calendar). The
  `leader_surface` switch remains as the Super-Admin off-switch; check-ins
  stay behind their own gate.

The job to be done is shepherding: noticing who needs attention, recording
care faithfully, and planning multiplication — not analytics or data entry
for its own sake.

## Product Purpose

Julian's admin operating system for shepherding Life Group Leaders,
organised as three areas — **Care · Plan · Multiply** (ADR 0016). Success
looks like Julian opening the app, seeing immediately who needs attention,
acting on it in one or two clicks (drawer edit, note, follow-up), and
trusting that nothing slips through. The tool should disappear into the
shepherding task.

## Brand Personality

**Warm, steady, legible.** The voice is pastoral and calm — a well-kept
ministry journal, not a SaaS dashboard. Warmth is carried by the editorial
serif voice (Newsreader display + italic accents), the sage/clay accent
language, and unhurried copy — never by haze, low contrast, or decoration.
Status colors are quiet signals (sage = well, clay = needs follow-up,
rose = concern), used to mean something, never to decorate.

## Anti-references

- **Default Tailwind/shadcn SaaS look** — interchangeable gray dashboards,
  hero metrics with gradient accents, identical icon-heading-text card
  grids.
- **BI/analytics density** — Looker/Grafana-style wall-of-widgets. Julian
  is one person caring for dozens of Leaders, not an analyst.
- **Gamified engagement apps** — streaks, confetti, badges. Pastoral care
  is not a game.
- **"AI cream haze" execution** — warm-paper backgrounds with muted gray
  text below WCAG contrast, tiny tracked-uppercase labels everywhere, soft
  shadows on everything. The existing cream/sage/clay identity stays, but
  it must be executed with confident contrast and scale, not washed out.

## Design Principles

1. **Clarity beats density.** One person, dozens of Leaders. Bigger type,
   fewer simultaneous signals, generous targets. If a screen needs study,
   it failed.
2. **One primary action per surface.** Every page answers "what should I
   do here?" with a single obvious next step; everything else is
   secondary or disclosed.
3. **Progressive disclosure, drawer editing.** Inline changes happen in
   the right-side drawer (full-screen sheet on mobile) per the Admin
   Interaction Model; navigation is reserved for changing jobs, not
   editing.
4. **Quiet status, earned color.** Accent color marks the primary action,
   the current selection, and pastoral status — nothing else. Reading the
   page calm is the default; color means "look here."
5. **Degrade gracefully, never report a false zero.** A failed read
   suppresses derived output with an honest message; empty states teach
   the next step instead of showing "nothing here."

## Accessibility & Inclusion

- **WCAG 2.1 AA** is the floor: body and interactive text ≥ 4.5:1 (the
  historical color-contrast carve-out in the a11y suite is being retired);
  large text ≥ 3:1.
- Keyboard-complete: every flow (including drawer editing) operable by
  keyboard with visible focus; skip link present; focus return on drawer
  close.
- Touch targets ≥ 44×44px on mobile; 16px minimum input font (iOS no-zoom
  guard stays).
- `prefers-reduced-motion` honored for any non-instant transition.
- Playwright + axe suite gates CI; `color-contrast` becomes blocking once
  the token deepening lands.
