# Home is a self-dismissing setup workspace

**Status:** Accepted

While any first-run setup step is incomplete, the admin Home leads with the
setup checklist as its primary panel; once every step reads `complete`, Home
reverts to the normal dashboard (needs-attention queue + at-a-glance stats).
Setup steps **deep-link out to where the work already lives** (the People
"Add person" drawer, `/admin/groups?tab=needs_setup`, …) carrying a
`?from=setup` marker so the target surface shows a "← Back to setup"
affordance, and returning to Home focuses the next incomplete step. We do
**not** resolve setup tasks inline on Home.

Each mode owns exactly one count: in setup mode the canonical number is the
**step count** ("X of Y setup steps still need attention") and the
needs-attention queue is suppressed; in dashboard mode the **attention queue**
is the primary surface. The "group setup gaps" sub-clause is dropped from the
checklist header (the detail already lives inside each step's line).

## Considered options

- **Inline resolution on Home** (rejected) — embedding the add-person /
  assign-leader / capacity forms directly on Home. Rejected because it forks
  UI that already lives on `/admin/people` and `/admin/groups`, creating two
  diverging copies of every setup form. The real complaint the review surfaced
  was disorientation ("I lost my place"), which the `?from=setup`
  return-affordance + next-step focus solves without duplication.
- **Stateful global defaults** (rejected) — flipping `/admin/groups` to
  default to `needs_setup`/cards while the system is fresh. Rejected so an
  experienced admin running an established ministry isn't shown a setup-shaped
  default. The guided flow's deep-links reach the task views instead; only the
  `needs_setup`/health tabs (and `?from=setup` arrivals) default to card view.

## Consequences

- Surfaces that are deep-linked from the setup checklist must honor the
  `?from=setup` marker and render the "← Back to setup" affordance.
- "Zero leaders" and similar empty states read as **not active yet** (not a
  vacuous success), and deep-link into the same setup chain.
