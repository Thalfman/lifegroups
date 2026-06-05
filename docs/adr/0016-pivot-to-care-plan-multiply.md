# Pivot to a three-area operating system: Care, Plan, Multiply

The app re-scopes from the three jobs of ADR 0010 ({know how my leaders are
doing, know what groups need to launch, know how my groups are doing}) to three
**areas**: **Care**, **Plan** (the Interest Funnel), and **Multiply**. Julian
has other methods for the group-assignment and headcount data the old surfaces
tracked, so those surfaces are turned off rather than maintained. This amends
ADR 0010 (surface budget / the three jobs) and ADR 0013 (the six-area nav
spine): the navigation collapses to **Home · Care · Plan · Multiply · Settings**
(plus the Super Admin entry for Tom).

## What each area is

- **Care** — one Over-Shepherd accordion. Each OS pane opens to their assigned
  Leaders and group names; from a Leader you reach that Leader's care (Leader
  Care Status, Care Notes, Prayer Requests, Leader-Health Grade) and the group's
  Group-Health Grade. It absorbs the former Leader-care, Over-Shepherd-coverage,
  and Group-Health surfaces. (Leaders → groups *coverage* assignments stay —
  they are the backbone of the accordion; it is *group/member* assignments and
  counts that go.)
- **Plan** — the Interest Funnel: Prospects moving Interested → Matched → Joined,
  or parked Not at this time, with a single current Next Step and an armed
  (provider-deferred) follow-up. Replaces the former Guests pipeline.
- **Multiply** — three boards by group type (Men's / Women's / Mixed), each
  assessed by four pillars. See ADR 0019.

## How the old surfaces are turned off

Groups, Planning/Launch, People (roster), the admin Calendar, and Follow-ups are
each hidden behind a **Super-Admin nav-visibility flag, default off**. Following
ADR 0008/0009's frozen-route discipline, their routes, tables, and filenames
stay and still resolve by direct URL; nothing is deleted, and Tom can re-show any
tab. The underlying data (memberships, capacity, the multiplication seed) is
retained, not dropped — only the surfaces are hidden.

## Why this is legal under the amended budget

ADR 0010 ties a surface to "one of the three jobs"; ADR 0013 added Home (triage)
and People (substrate) as recognised non-job areas. This ADR redefines the job
set those rules point at. Care, Plan, and Multiply are the three jobs now; Home
remains the cross-job triage area; People stops being a top-level area (it
becomes the hidden substrate the leader care surface reads). Settings/Super Admin
remain the non-job "System" area. The count constraint and model-clarity gate
are unchanged and still bind.

## Considered options

- **Delete the old surfaces.** Rejected: irreversible, and Julian may still want
  the data behind a direct URL. Flag-off keeps the door open.
- **Add Plan/Multiply without hiding anything.** Rejected: leaves the
  numbers/assignment surfaces Julian is moving away from, and busts the surface
  budget.

## Consequences

- README/PRD's "three jobs" framing (Care, Launch Planning, Group Health) is
  superseded by this area set; those docs are updated to point here.
- A new class of feature flag exists: **nav-visibility flags that hide an
  on-by-default surface** (the inverse of ADR 0009's frozen-surface flags, which
  re-enable an off-by-default surface). These are Super-Admin-owned and audited
  like the rest of the flag store.
- Adding a fourth area still requires its own ADR, exactly as ADR 0010 demands.
