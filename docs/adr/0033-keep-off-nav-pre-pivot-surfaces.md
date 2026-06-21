# Keep the off-nav pre-pivot surfaces (no retire, no re-export)

**Status:** Accepted — 2026-06-21. References ADR 0009, ADR 0013, ADR 0016.

The 2026-06 pivot (ADR 0016) reorganised the admin spine around Care · Plan ·
Multiply and hid the pre-pivot surfaces behind Super-Admin nav-visibility flags
(ADR 0009/0013) rather than deleting them. Seven of those surfaces still resolve
by direct URL with working action handlers: `guests`, `planning`,
`launch-planning`, `group-health`, `calendar`, `check-ins`, and `shepherd-care`.

The 2026-06-21 full-codebase audit (`docs/audits/2026-06-21-full-codebase-audit.md`,
finding **ARCH-8 / P2**) raised that these frozen surfaces could drift from the
canonical surfaces, and that a frozen action whose RPC contract changes could
break silently. It recommended deciding, per surface, between **keep** (accept
the cost, document why), **retire** (deprecation banner + warn-log on invoke),
or **re-export** (point the frozen surface at the canonical action to remove
duplication). That is a product/architecture judgment, so it was escalated to
the maintainer (issue #779).

## Decision

**Keep all seven surfaces.** No retire, no re-export, no warn-logs, no new
banners, no route removals in this pass.

Investigating the surfaces showed the audit's "drift-prone duplicate" premise
was partly off: five of the seven are **alias-renders** of the canonical shells
and/or their action files are the **canonical home** for actions the live
Care · Plan · Multiply surfaces import — they merely sit in pre-pivot-named
folders. A "retire + warn-log on invoke" would therefore fire on _canonical_
use, which would be actively wrong.

| Surface           | Reality                                                                                                                                                                                                                          | Verdict                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `planning`        | Canonical Planning host (`PlanningView` — Calendar/Launches/Capacity/Scenarios/Multiplication tabs); the shared loader for the two aliases below.                                                                                | Keep                                              |
| `launch-planning` | Page alias-renders `PlanningView` (Launches tab); its `actions.ts` is imported by **canonical Multiply** (`components/admin/multiply/*`, `components/admin/multiplication/*`).                                                   | Keep                                              |
| `calendar`        | Page alias-renders `PlanningView` (Calendar tab); no own actions.                                                                                                                                                                | Keep                                              |
| `shepherd-care`   | Page alias-renders the canonical Care shell (`CarePageView`); its `actions.ts` is imported by **canonical Care** (`components/admin/shepherd-care/*`).                                                                           | Keep                                              |
| `group-health`    | Standalone triage page (own shell), but its `grade-actions.ts` is imported by **canonical Care** (`components/admin/care/group-rubric-grade-entry.tsx`) and is reached via the "Edit rubric" deep-link (`lib/nav/return-to.ts`). | Keep                                              |
| `guests`          | Self-contained (`actions.ts` used only by `components/admin/guests/*`); the only Prospect/Interest-Funnel surface that exists — no canonical replacement has been built yet.                                                     | Keep (preserve pending a future canonical funnel) |
| `check-ins`       | Standalone admin review of weekly leader check-ins (own shell + data path); the only **admin-side** window into live leader check-in data (the Leader surface is on by default per ADR 0024).                                    | Keep                                              |

So the keep verdict rests on two rationales: the five entangled surfaces are
**not duplicates** (alias-render + canonical-imported actions), and `guests` /
`check-ins` are **not yet replaceable** (no canonical surface covers them).

## What does NOT change

- **No banners / warn-logs / re-exports / route deletions.** The existing
  `FrozenSurfaceBanner` and the admin page runner's `frozenBanner` (ADR 0028)
  stay exactly as they are. Nothing in behavior changes.
- **Action files stay in their current folders this pass.** Relocating the
  canonical-imported action files (`launch-planning/actions.ts`,
  `shepherd-care/actions.ts`, `group-health/grade-actions.ts`) out of their
  pre-pivot-named folders and into the canonical component trees is a separate
  refactor — explicitly **out of scope** here, consistent with the
  no-hard-removal / archive posture.
- The nav-visibility flags (ADR 0009/0013) are untouched; these surfaces remain
  reachable by direct URL only.

## Drift mitigation (why "keep" is safe)

The audit's drift concern is largely structural rather than real: because the
five entangled surfaces share one loader/shell or one action module with the
canonical surface, they **cannot** drift from it — there is a single source. The
two self-contained surfaces (`guests`, `check-ins`) own their own contracts and
will be re-evaluated when (and if) a canonical replacement is built. To make the
"this is the canonical home, do not warn-log/retire it" intent legible at the
point of edit, each of the three canonical-imported action files and each of the
seven `page.tsx` files carries a short comment pointing back to this ADR.
