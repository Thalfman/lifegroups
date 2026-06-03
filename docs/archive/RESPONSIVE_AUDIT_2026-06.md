# Admin Responsive (Phone Usability) Audit — June 2026

Admin Interaction Model PRD req 13 (P2 / Could-Have), execution step 17 of 17. Issue #264. Source: [`docs/plans/ADMIN_INTERACTION_MODEL_PRD.md`](../plans/ADMIN_INTERACTION_MODEL_PRD.md).

## 1. Why this memo exists

The PRD's final polish step is a pass over **every legacy admin surface**
for phone usability, beyond the mobile-capable editing pattern delivered in
P0. The acceptance criteria: surfaces usable on a phone viewport without
horizontal scrolling or clipped controls, and axe passing on mobile
viewports. This memo records the review, the two gaps it found, and the
regression net that keeps them closed.

Priority context (PRD Open Question 2): whether the director uses the app
on a phone. Non-blocking — the work is low-risk and the audit is cheap to
hold in place, so it shipped without waiting on that confirmation.

## 2. What was already in place (P0 → P1)

The earlier slices did most of the responsive work surface by surface, as a
set of plain mobile helper classes in [`app/globals.css`](../../app/globals.css)
under the `@media (max-width: 767px)` block. They use `!important` so they
override React inline `style={{…}}` without editing each component's style
prop:

| Helper                                                     | Effect on phone                                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `.lg-m-grid-stack`                                         | Multi-column form/card grids collapse to one column                                   |
| `.lg-m-filterbar` / `.lg-m-master-calendar-filters`        | Filter bars collapse to one column, children go full width                            |
| `.lg-m-form-2up`                                           | Two-up form rows collapse to one column                                               |
| `.lg-shell-grid-2/3/4/6/7`                                 | Dashboard / shell grids collapse (1 or 2 columns)                                     |
| `.lg-super-admin-command-layout` / `-section-rail`         | Super Admin command layout stacks; the section rail becomes a horizontal scroll strip |
| `.lg-m-editing-surface`                                    | The desktop right-side edit drawer becomes a full-screen sheet                        |
| `.lg-m-input` + a global `font-size: 16px` on all controls | Inputs go full width; 16px stops iOS focus auto-zoom                                  |
| `html, body { overflow-x: hidden }`                        | Page-level guard against stray horizontal scroll                                      |

Because of this, most surfaces flagged by a naive grep of multi-column
`gridTemplateColumns` are **false positives**: the offending inline grid
sits on an element that already carries `.lg-m-grid-stack` (or a sibling
helper) on the line above, so it collapses on phones. Verified across
Dashboard, Super Admin (command cards are `cardGridStyle`/`twoCardGridStyle`
applied _with_ `.lg-m-grid-stack`), Leader pipeline, Multiplication,
Capacity board, the invite/role/assign/coverage forms, Groups directory and
People directory filter bars, and Check-in detail.

## 3. Surfaces reviewed

All admin surfaces mounted in the gated a11y harness
([`app/a11y-harness/harness-client.tsx`](../../app/a11y-harness/harness-client.tsx))
plus the remaining legacy components under `components/admin/**` and
`components/lg/admin/**`:

Groups directory · Master calendar (list + grid + filters) · Follow-ups
(admin queue) · People (directory / add / assignments) · Group health
triage · Settings · Super Admin console · Check-ins (review + detail) ·
Shepherd care (directory, follow-ups, care actions, over-shepherds,
interaction timeline) · Launch planning (scenarios) · Leader pipeline ·
Multiplication · Capacity board · Guests · Dashboard.

Data tables already wrapped in an `overflow-x: auto` scroll region (the
correct fix for a wide table — it scrolls inside its own box instead of the
whole page): shepherd-care care directory, over-shepherd list, launch
planning scenarios, test accounts panel.

The 7-column master calendar grid uses `repeat(7, minmax(0, 1fr))`. The
`minmax(0, …)` floor lets the columns shrink to fit any width, and
`.lg-m-cal-cell` / `.lg-m-cal-pill` shrink cell height and pill font, so it
fits a phone without horizontal scroll. (Admin work also defaults to the
List view — PRD req 11.)

## 4. Gaps found and fixed

Two genuine issues — surfaces with no mobile collapse helper:

1. **Group health triage table** — the one admin data table _not_ wrapped
   in a scroll region. Seven text columns cannot fit 375px, so it forced
   horizontal page scroll. Fixed by wrapping it in an `overflow-x: auto`
   region, matching the other admin tables.
   ([`components/lg/admin/group-health-triage.tsx`](../../components/lg/admin/group-health-triage.tsx))

2. **Editable copy form** (Super Admin) — `minWidth: 240` could push past a
   narrow phone inside the section's padding. Changed to
   `minWidth: min(240px, 100%)`: a comfortable desktop minimum that never
   exceeds the viewport.
   ([`components/admin/forms/editable-copy-form.tsx`](../../components/admin/forms/editable-copy-form.tsx))

## 5. Regression net

[`tests/a11y/responsive-mobile.spec.ts`](../../tests/a11y/responsive-mobile.spec.ts)
renders every harness surface at a 375px phone viewport and asserts:

- **No horizontal page overflow** per surface — `scrollWidth <= clientWidth`
  on each `[data-a11y-surface]` section. Content that is legitimately wide
  (a data table) lives in its own `overflow-x: auto` wrapper, which clips at
  the wrapper and does not widen the section, so it stays green while
  scrolling inside its region.
- **axe finds no critical/serious violations** at the mobile viewport
  (color-contrast remains the one documented non-blocking palette carve-out,
  a PRD Non-Goal).

New surfaces are covered automatically: add them to the harness and they
join both loops. Run with `npm run test:a11y`.
