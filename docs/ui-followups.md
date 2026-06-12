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

1. **Frozen surfaces still inline-styled** (master calendar, guests,
   planning, launch planning, capacity board). They are token-coherent
   through the `P.*` → `var(--c-*)` aliases and got spot fixes (stripes
   removed, microtext floored, AA washes fixed), but the full Tailwind
   migration is deferred until a surface un-freezes — migrate it in the
   PR that revives it, and delete its `.lg-m-*` rules in the same
   commit. **Paid (ADR 0024 revival):** the Groups directory + group
   detail + group calendar chrome, the People directory + add-person
   forms, and the person detail shell were migrated when their nav tabs
   came back on; shared frozen-surface components (calendar
   month-grid/event-list, leader-pipeline) keep their debt until their
   own surfaces revive.
2. **`.lg-m-*` mobile override layer (reduced, not gone).** Deleted:
   shell, nav-drawer, user-pill, sign-out, editing-surface, grid rules.
   Still consumed (by frozen surfaces + sanctioned shims):
   `lg-m-grid-stack` (~12 files; the groups/people usages moved to
   responsive variants), `lg-m-input` (iOS 16px guard),
   `lg-m-sticky-submit`, `lg-m-noscrollx`, `lg-m-filterbar` (guests
   only), `lg-m-form-2up` (1), `lg-m-roster-row`/`lg-m-attbtn`
   (check-in), `lg-m-cal-*` (now 11px floor),
   `lg-m-master-calendar-filters`. (`lg-super-admin-workspace-tabs` was
   deleted when the super-admin rail switched to wrapping on mobile.)
   No remaining rule is orphaned.
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
9. **Care accordion note counts read one row per note.**
   `lib/supabase/care-accordion-reads.ts` fetches every readable
   `care_notes` / `prayer_requests` `subject_profile_id` and counts in
   JS for the per-leader badges. Fine at small-church note volume;
   when it grows, replace with a count aggregate — the counts are
   RLS-scoped (what the viewer may read), so a `SECURITY DEFINER`
   count RPC would have to re-encode the grant logic rather than lean
   on RLS, which is why this wasn't done inline.
10. **`LeaderGroupCard` is currently orphaned.** No route imports
    `components/dashboard/leader-group-card.tsx` (the flag-gated leader
    surface renders other components); it was restyled anyway so it lands
    on-system when revived. Its hero overlays were re-tinted to `bg-ink/*`
    for AA. Related gap: the a11y suite mounts admin surfaces only —
    leader routes have no axe coverage, so add a leader spec in the PR
    that flips `leader_surface`.

## Guardrails now active

- axe `color-contrast` **blocks** in every a11y spec (no carve-outs).
- `detect.mjs` is clean — run it before merging UI work; new hits are
  regressions.
- No hex/oklch literals in components: tokens or `var(--c-*)` only.
- One `primary` action per surface; border **or** shadow, never both;
  serif speaks once; nothing readable below 11px.
