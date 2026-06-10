# UI follow-ups — post-implementation gaps

> Phase 4 companion to `ui-audit.md` (the findings) and
> `design-direction.md` (the approved spec). Everything here is **known,
> bounded debt** left after the 2026-06 implementation slices — not a
> license to add more of it. The detector (`detect.mjs`) reports **0**
> anti-pattern hits; the axe `color-contrast` rule is **blocking** in
> `tests/a11y/harness.ts`.

## What shipped

Foundation tokens (AA ink/accent ramps, 11px-floor type scale, radius/z
scales, Button + Badge kit, `lib/pastoral.ts` aliased to canonical vars),
then surface migrations: shell/nav · Home · editing drawer · Care (×2) ·
Plan/Multiply · Settings/forms · super-admin/danger zone · over-shepherd ·
auth/hub · leader · frozen-route spot fixes (stripes, calendar microtext,
opacity washes). All 22 audit side-stripes are restructured; every slice
passed lint → typecheck → unit suite → build → mapped a11y specs.

## Remaining debt (tracked, deliberate)

1. **Frozen surfaces still inline-styled** (~34 files: master calendar,
   guests, planning, people/groups directories, launch planning,
   capacity board, person detail, group management). They are
   token-coherent through the `P.*` → `var(--c-*)` aliases and got spot
   fixes (stripes removed, microtext floored, AA washes fixed), but the
   full Tailwind migration is deferred until a surface un-freezes —
   migrate it in the PR that revives it, and delete its `.lg-m-*` rules
   in the same commit.
2. **`.lg-m-*` mobile override layer (reduced, not gone).** Deleted:
   shell, nav-drawer, user-pill, sign-out, editing-surface, grid rules.
   Still consumed (by frozen surfaces + sanctioned shims):
   `lg-m-grid-stack` (~16 files), `lg-m-input` (iOS 16px guard),
   `lg-m-sticky-submit`, `lg-m-noscrollx`, `lg-m-filterbar`,
   `lg-m-form-2up` (1), `lg-m-roster-row`/`lg-m-attbtn` (check-in),
   `lg-m-cal-*` (now 11px floor), `lg-m-master-calendar-filters`,
   `lg-super-admin-workspace-tabs`.
3. **Compatibility wrappers.** `PButton`/`PLinkButton`/`Pill`/`PBadge`
   delegate to `components/ui/button.tsx` / `badge.tsx`. New code should
   import `Button`/`Badge` directly; collapse the wrappers when their
   call-site count makes it cheap.
4. **`MetricCard` color props.** `dashboard-summary-cards` (care) and
   `launch-planning/summary-cards` still pass `P.*` strings into
   `accent`/`valueColor`. Fine (vars, not hexes) — candidates for a tone
   enum when next touched.
5. **Unused density var.** `--font-scale` no longer has consumers
   (PageHeader migrated off it); remove it with the next globals sweep,
   or wire it to a real density setting.
6. **shadcn HSL bridge stays** (backs the global focus ring) — deepened
   alongside the palette, by design (direction §1).
7. **a11y-harness inline styles** are test scaffolding, exempt from the
   no-inline-styles rule.
8. **Audit P3 dispositions:** P3.15 (italic accent spans at card sizes)
   resolved where surfaces migrated; P3.16 login verse restructured;
   P3.17 "review →" stayed a text glyph (deliberate — matches the serif
   voice better than a lucide arrow); P3.18 mobile calendar pills now
   render at the 11px floor.

## Guardrails now active

- axe `color-contrast` **blocks** in every a11y spec (no carve-outs).
- `detect.mjs` is clean — run it before merging UI work; new hits are
  regressions.
- No hex/oklch literals in components: tokens or `var(--c-*)` only.
- One `primary` action per surface; border **or** shadow, never both;
  serif speaks once; nothing readable below 11px.
