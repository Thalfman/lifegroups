# UI Audit — Heuristic Evaluation & Technical Scan

> Phase 1 of the UI/UX upgrade (2026-06). Method: the bundled impeccable
> skill's `critique` + `audit` flows — an independent design review
> (Assessment A: every harness surface + public routes screenshotted at
> 1280px and 375px) recorded **before** the deterministic anti-pattern scan
> (Assessment B: `detect.mjs` over `app/` + `components/`), then synthesized.
> Severity: **P0** blocking · **P1** major (fix in this effort) · **P2**
> minor · **P3** polish. Companion docs: `design-direction.md` (the
> proposal), `ui-followups.md` (post-implementation gaps).

## Executive summary

The app has a real identity — warm pastoral palette, editorial serif voice,
excellent domain language — and solid interaction bones (drawer editing with
focus management, a genuinely good Needs-Attention triage queue, honest
degraded-read states). What it lacks is **execution discipline**: styling
lives in ~2,000 inline `style` props across 201/263 TSX files, so there are
no hover/focus/responsive variants, a `!important` mobile override layer
fights the components, and three color systems have drifted apart. The
visible symptoms: microtext (9–11.5px) everywhere, sub-AA contrast on muted
text and primary buttons, stripe accents and eyebrow labels as universal
decoration, and two walls of identical stat tiles on the highest-traffic
screen. Nielsen total: **25/40 ("Acceptable — significant improvements
needed")**. Nothing is broken functionally; almost everything needs visual
re-execution.

## Design health score (Nielsen heuristics, 0–4)

| #   | Heuristic                       | Score     | Key issue                                                                                                                                                                 |
| --- | ------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Visibility of system status     | 3         | Nav pending spinner, triage queue, form feedback all good; tab switches and row actions give little hover/pressed feedback (inline styles can't express states)           |
| 2   | Match system / real world       | 4         | Exemplary: Care · Plan · Multiply, pastoral copy ("The week ahead is clear"), CONTEXT.md vocabulary used faithfully                                                       |
| 3   | User control and freedom        | 3         | Drawer closes via Esc/overlay/×, focus returns; Archive-default is reversible; no undo on status changes                                                                  |
| 4   | Consistency and standards       | 1         | Three color systems (`--c-*`, shadcn HSL, `lib/pastoral.ts` hex), ≥3 badge tone systems, 3 card variants, font sizes 10–14px ad hoc, radii 8/10/12/14/999, two app shells |
| 5   | Error prevention                | 3         | Rubric weights gate at 100, type-to-confirm danger zone, validated forms                                                                                                  |
| 6   | Recognition rather than recall  | 3         | Labeled nav with icons, visible tabs, deep links; period slicer state is subtle                                                                                           |
| 7   | Flexibility and efficiency      | 2         | No keyboard shortcuts, no bulk actions; acceptable for a one-director audience but thin                                                                                   |
| 8   | Aesthetic and minimalist design | 1         | Eyebrow microlabels on every section _and_ card, ornament dividers, duplicated instruction copy, 11 identical stat tiles on Home, everything boxed at equal weight        |
| 9   | Error recovery                  | 3         | ErrorBanner is honest ("couldn't load — counts suppressed"), inline field errors near source                                                                              |
| 10  | Help and documentation          | 2         | Per-surface ledes are good; Readiness has a Help/About disclosure; no other contextual help                                                                               |
|     | **Total**                       | **25/40** | **Acceptable — significant improvements needed**                                                                                                                          |

**Cognitive load checklist:** 4 of 8 failed (single focus, visual hierarchy,
minimal choices, one-thing-at-a-time) — driven almost entirely by the Home
dashboard and equal-weight action rows. Moderate-to-high.

## Anti-patterns verdict (Assessment A + B convergence)

Would someone say "AI made this"? **At the token level, yes-adjacent**: the
cream-paper + tracked-uppercase-eyebrow + soft-shadow-card grammar is the
saturated 2024–26 default. The serif voice and pastoral copy pull it back;
the execution tells push it forward.

**Deterministic scan** (`detect.mjs --json app components`): **22 hits, all
one family — side-stripe accent borders — in 17 files**, confirming the
review. No gradient text, no glassmorphism, no stripe backgrounds detected.

Side-stripe locations (P1, all must be restructured, not recolored):

- `components/lg/SummaryCard.tsx` — top-stripe variant on every Home stat tile
- `components/lg/admin/dashboard/NeedsAttentionArea.tsx` — left stripes on the triage queue
- Auth flow: `app/forgot-password/forgot-password-form.tsx`, `app/reset-password/*` (2), `app/invite/[token]/*` (2), plus the login verse blockquote
- Calendar: `components/admin/admin-master-calendar-{grid,list,shell}.tsx`
- `components/admin/check-in-{detail,review}-shell.tsx`
- `components/admin/follow-ups/follow-ups-shell.tsx`
- `components/admin/guests/guest-card.tsx`, `components/admin/plan/prospect-board.tsx`
- `components/admin/planning/planning-by-leader-list.tsx`
- `components/dashboard/leader-group-card.tsx` (removed, #547), `components/leader/leader-follow-ups-section.tsx`

## Priority issues

### P1 — major (the redesign's core backlog)

1. **Sub-AA contrast on reading text and primary actions** — routes: all.
   `--c-ink3` (oklch 0.58) meta text on cream and white-on-`--c-clay`
   (oklch 0.58) terra buttons sit ≈4.2–4.3:1 (the axe `color-contrast`
   rule is disabled in `tests/a11y/harness.ts` to tolerate exactly this);
   `--c-ink4` (oklch 0.72) is used for sidebar group labels and eyebrows at
   ≈2.6:1. For a non-technical director this is the single biggest
   readability tax. _Fix:_ deepen the ink/clay ramps in `globals.css`,
   then re-enable the axe rule as blocking (locked decision).
2. **Microtext as system grammar** — routes: all. Pills 10.5px, sidebar
   group labels 10px, nav links 13.5px, form labels/eyebrows 11px tracked
   uppercase, mobile calendar weekday 9px (`.lg-m-cal-weekdays`). _Fix:_
   type scale with an 11px floor; most UI text moves to 13–14px.
3. **Side-stripe accents (22×/17 files)** — see list above. _Fix:_ full
   borders, background tints, leading status dots, or nothing.
4. **Eyebrow-on-everything + ornament dividers** — `/admin` (5 section
   eyebrows + 11 card eyebrows), `/admin/settings` (ornament + eyebrow +
   serif heading stacked three-deep per section), every PageHeader. The
   2023-era kicker as universal scaffolding. _Fix:_ one kicker per page
   max (the PageHeader brand voice); sections get plain serif headings;
   cards get sentence-case 13px labels.
5. **Identical hero-metric card walls** — `/admin`: Ministry Snapshot (6
   identical tiles) + Recent Activity (5 more); on mobile this is ~12
   screens of single-column near-identical boxes. _Fix:_ one compact
   vital-signs band (grouped figures, no per-number cards) + a single
   activity summary row; vary card anatomy by content.
6. **Mobile overflow on Home triage rows** — `/admin` at 375px: the
   "N review →" affordance is clipped at the right edge
   (`NeedsAttentionArea` row layout doesn't wrap). _Fix:_ responsive row
   stacking in the rebuilt component.
7. **No interactive-state vocabulary** — routes: all. Inline styles mean
   no `:hover`/`:active` on most rows, list items, and several buttons;
   feedback is binary. _Fix:_ the Tailwind migration itself (variants per
   component) — this is the structural payoff of the whole refactor.
8. **Three-way color-system drift** — `app/globals.css` OKLCH vars vs
   `lib/pastoral.ts` hex (≠ values: `P.bg #f5ecd9` is visibly deeper than
   `--c-bg`) vs shadcn HSL bridge. Admin dashboard cards
   (`overview-primitives.tsx`) render in pastoral hex while sibling cards
   use `--c-*` — same screen, two creams. _Fix:_ alias `pastoral.ts` to
   `var(--c-*)` (locked decision).

### P2 — minor

9. **Duplicated instruction copy** — `/admin/settings`: each rubric card
   repeats its section lede nearly verbatim inside the card. Double
   reading burden. _Fix:_ one instruction per card, in the card.
10. **Equal-weight action rows exceed working memory** — Care actions: six
    identical ghost pills (Log call / Log text / Log visit / Update status
    / Set next step / Add summary). _Fix:_ group into 1 primary + grouped
    secondaries (e.g. "Log a touchpoint" split-action) or chunk visually.
11. **Ghost-card pattern** — 1px border + wide soft shadow together on
    cards (login card, Home tiles). _Fix:_ border _or_ shadow per the
    elevation rule in DESIGN.md.
12. **Redundant double labels** — Home "THIS WEEK" section eyebrow above a
    card with its own "THIS WEEK" eyebrow + "The week ahead" heading.
13. **Status badges all-caps tracked at 10.5px** (DOING WELL / NEEDS
    FOLLOW-UP) — hard to scan, triple-emphasized (caps + tracking + tone).
    _Fix:_ sentence case, 12–13px, tone carries the signal.
14. **Period slicer / segmented controls** small with subtle active state
    (`/admin` Recent Activity, Settings tabs) — selected state needs more
    than a white pill at 12px.

### P3 — polish

15. Serif italic accent spans render at `--c-ink2` next to ink titles —
    fine at 38px, muddy at card sizes.
16. `Verse` blockquote on login uses a left-stripe — restructure when auth
    slice lands (keep the verse; it's brand voice).
17. Dashboard "review →" arrows are text glyphs; align with lucide icons
    used elsewhere.
18. Calendar month grid pills (10px) unreadable at 375px — acceptable only
    because calendar is a frozen surface; document in followups if not
    fixed.

## Technical scan (impeccable `audit` dimensions, 0–4)

| Dimension     | Score    | Evidence                                                                                                                                                                                                                                                  |
| ------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accessibility | 2        | Strong: global focus-visible ring, skip link, drawer focus capture/return, labeled controls, 44px attendance targets, iOS 16px input guard, 15-spec axe suite. Failing: contrast carve-out (P1.1), microtext (P1.2), hover-only affordances absent (P1.7) |
| Performance   | 3        | next/font self-hosted fonts, no heavy assets, full-route prefetch on sidebar, static public pages. Cost: ~2,000 inline style objects bloat SSR HTML and defeat class dedupe; no skeleton on some tab switches                                             |
| Responsive    | 2        | Dedicated `!important` mobile layer works but is brittle (P1.6 overflow proves it); single-column stacking produces 12-screen scrolls on Home; drawer→sheet behavior is solid                                                                             |
| Theming       | 1        | Three token systems, hex literals in components (`#fbf6e8`, `#b85a3c`, status borders `#efdfa3`), density vars defined but only consumed twice, dark mode configured but unused                                                                           |
| Anti-patterns | 1        | 22 detector hits (one family); eyebrow grammar; identical card grids; ghost-card border+shadow                                                                                                                                                            |
| **Total**     | **9/20** |                                                                                                                                                                                                                                                           |

## Persona red flags

**Julian — non-technical ministry director (primary).** The Needs-Attention
queue answers "what do I do?" well — then the rest of Home buries it under
11 stat tiles he has to scroll past on his phone, where the queue's own
"review →" links are clipped (P1.6). Meta text and labels he actually needs
(who's stale, coverage gaps) are the lowest-contrast, smallest text on the
page. Settings makes him read every instruction twice (P2.9).

**Sam — screen reader / low vision.** ARIA wiring is genuinely good (axe
suite, accessible names, focus management). What fails him is visual:
4.2:1 muted text, 2.6:1 eyebrows, 9–10.5px type, and color-only status
signals on the funnel bars (the badges carry text, the mini-bars don't).

**Alex — power user (Tom).** No shortcuts, no bulk actions, six-click
care-logging round trips per leader. Tolerable for this audience; noted,
not prioritized.

## What's working (preserve in the redesign)

1. **The domain voice.** Care · Plan · Multiply, "The week ahead is
   clear", verse on login, serif wordmark — this is a product with a soul;
   the redesign's job is to execute it confidently, not replace it.
2. **The interaction model.** Drawer editing (460px / full sheet on
   mobile) with real focus management; one primary terra action per form
   card; type-to-confirm in the danger zone; Archive-default.
3. **Honest empty/error states.** Degraded reads suppress derived counts
   with an explanation instead of lying with zeros; empty queues speak
   pastorally ("The week ahead is clear").

## Run notes

- Assessment A recorded before Assessment B was read (sequential
  independence per `reference/critique.md`; sub-agent isolation not used).
- Detector: `node .agents/skills/impeccable/scripts/detect.mjs --json app
components` → 22 findings / 17 files / 1 family. No false positives
  spot-checked among 6 sampled hits.
- Visual evidence: 50 screenshots (21 harness surfaces + 3 public routes ×
  2 viewports) via Playwright against `/a11y-harness` with
  `NEXT_PUBLIC_A11Y_HARNESS=1`; chromium r1194 stood in for r1223 (CDN
  blocked in this environment; symlinked — rendering unaffected).
- Snapshot persistence skipped per critique.md (whole-app target has no
  stable slug).
- Protected admin routes were audited via the harness (real components,
  deterministic fixtures); live-auth walkthrough was not possible without
  credentials — no findings are expected to differ, but the Phase 4 pass
  should re-confirm on a seeded environment if available.
