# Six-area navigation spine, amending the one-job mapping rule

The Ministry Admin navigation is collapsing onto six job-oriented areas —
**Home, Groups, Care, People, Planning, Settings** — rendered as a flat list on
every navigation surface (admin sidebar, Home Hub launcher tiles, bottom nav).
This is the foundation of the UI/UX reduction (`docs/archive/REDUCTIONPLAN.md` §1–§2,
§14). It amends ADR 0010, whose surface-budget rule requires every
user-reachable surface to "map to exactly one job", because two of the new
areas (Home, People) deliberately do not map to a single job. This ADR records
the six-area IA, the area→job mapping, and what each area consolidates, so the
structure is legal under ADR 0010 and the tension is documented rather than
silently broken.

## The six areas and their job mapping

ADR 0010 anchors the surface budget to Julian's three jobs (PRD.md, Q12):
(1) know how my leaders are doing, (2) know what groups need to launch,
(3) know how my groups are doing (Group-Health Grade). The six areas map as:

| Area         | Maps to                                                              |
| ------------ | -------------------------------------------------------------------- |
| **Groups**   | Job 3 — how my groups are doing (Group-Health Grade)                 |
| **Care**     | Job 1 — how my leaders are doing                                     |
| **Planning** | Job 2 — what groups need to launch                                   |
| **Home**     | Cross-job triage surface — sees across all three jobs; not a 4th job |
| **People**   | Shared people substrate the three jobs draw on; not a job itself     |
| **Settings** | "System" utility area — the existing non-job exception (ADR 0010)    |

Three areas (Groups, Care, Planning) each map cleanly to exactly one job and
satisfy ADR 0010 unchanged. The remaining three are the exceptions this ADR
legalises.

## The amendment to ADR 0010

ADR 0010 rule 1 ("maps to exactly one job") is amended to recognise three
classes of legal user-reachable area, not one:

1. **A job area** maps to exactly one of the three jobs. (Unchanged — this is
   ADR 0010's original rule. Groups, Care, Planning.)
2. **The triage surface (Home)** is the single cross-job area whose explicit
   purpose is to see _across_ all three jobs and route the operator to the
   right job area. It is not a fourth job and not a loophole for adding more
   cross-cutting surfaces: there is exactly one, and it owns no work of its own
   — every action it surfaces belongs to and links into a job area.
3. **A substrate area (People)** is shared ground the three jobs all read from
   (the roster of leaders and members) rather than a job in itself. Like
   "System", it is a recognised non-job area, held to the same
   name-what-it-replaces discipline but not forced to map to one job.

"System" (Settings, Super Admin Console) remains the non-job utility area
exactly as ADR 0010 describes it. The count constraint (rule 2,
name-what-it-replaces) and the model-clarity gate are **unchanged** and still
bind every area, including the three exceptions.

## What each area consolidates (ADR 0010 rule 2)

The net top-level destination count drops (~9 → 6) even though two new landing
routes (`/admin/care`, `/admin/planning`) are added, because the old
destinations become tabs/children of the new areas rather than peers:

- **Care** replaces **Leader care** (`/admin/shepherd-care`) + **Follow-ups**
  (`/admin/follow-ups`) as the entry point; both become Care's contents (#301).
- **Planning** replaces **Launch Planning** (`/admin/launch-planning`) +
  **Calendar** (`/admin/calendar`) as the entry point; both become Planning's
  contents (#303).
- **Groups** absorbs **Group Health** (`/admin/group-health`): Group health
  becomes a view under Groups rather than its own top-level destination.
- **Home** is the existing `/admin` overview, becoming the cross-job triage
  page (#299).
- **People** and **Settings** keep their existing routes.

## Constraints carried in unchanged

- **Frozen routes/paths/filenames stay (ADR 0008/0009).** This is a nav
  grouping/label change only. `/admin/shepherd-care`, `/admin/follow-ups`,
  `/admin/launch-planning`, `/admin/calendar`, `/admin/group-health`,
  `/admin/check-ins` keep their paths, tables, and filenames and still resolve
  by direct URL under the admin guard. The two new areas are NEW routes that
  link to / will host those surfaces' content; they rename nothing.
- **Super Admin stays exactly as-is (ADR 0002).** The `/admin/super-admin`
  entry is added only for `role === "super_admin"` and is unchanged. The
  six-area structure describes normal-admin nav and must not hide or replace
  it; Super Admin renders as an appended entry after the six areas, not as one
  of them.

## Consequences

- All three nav surfaces render the six areas as a flat list with no section
  headers. The former grouped sidebar (`top` / Ministry Admin / Manage /
  System) collapses to a single flat group.
- This slice introduces only the area entry points and the two new landing
  shells (`/admin/care`, `/admin/planning`). The tabbed contents that merge the
  underlying routes are built in later slices (#299–#304); until then the
  shells link out to the surfaces they will host.
- A reviewer can still reject a future area on budget grounds: the legal set is
  three job areas + Home + People + System. Adding a seventh area requires its
  own ADR, the same way changing the three jobs would.
