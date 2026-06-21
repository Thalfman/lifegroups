# The All Notes feed, and admins join the Care Note author set

**Status:** Accepted

Care Notes and Prayer Requests worked, but two things made them hard to use
day-to-day: only Over-Shepherds could write them (the Ministry Admin had no
authoring path at all), and there was no way to see notes in one place — every
note rendered only inside one leader's or one group's page, sealed behind the
per-person transparency toggle. This ADR fixes both **without changing the
author-private visibility model** (ADR 0017/0020): writes widen, reads
aggregate, and the sealed-by-default guarantee stands.

## Decisions

### 1. The Ministry Admin (and Super Admin) may author Care Notes and Prayer Requests

ADR 0017 scoped authorship of profile-subject notes to "the Over-Shepherd who
covers the leader" (`auth_over_shepherd_covers`). That left the Ministry Admin
— the person doing the most shepherding — unable to record a care observation
without an over-shepherd assignment. The `admin_write_care_note` /
`admin_write_prayer_request` RPCs now gate authorship on
**`auth_is_admin() OR auth_over_shepherd_covers(subject)`** (migration
`20260701000000`). Everything else is unchanged: the subject must still be an
active leader/co_leader, the body is trimmed and 4000-bounded, and the paired
audit row records `has_body` only.

**The visibility truth table is untouched.** The author always reads their own
rows (role-independent); the _other_ admin reads a note only via the subject's
transparency grant. An admin-authored note is therefore author-private to that
admin exactly as an OS-authored note is to its OS — Super Admin gets no new
bypass, and `lib/admin/care-note-visibility.ts` needed no change.

### 2. The Care area gains a fifth tab: **Notes** — everything the viewer may read

`/admin/care` now has a Notes tab (`view=notes` deep-links to it) aggregating,
newest-first with leader/group/type filters:

- **Care Notes** and **Prayer Requests** the viewer may read — fetched with no
  subject filter and **RLS does the scoping** (own authored rows + rows whose
  gating leader's grant is on). No new read path around the policies.
- **Broad notes** (`shepherd_care_interactions` rows of type `other`) —
  including their bodies. Broad notes are deliberately ladder-readable
  (ADR 0002 / LDR.1); the recent-updates feed's body exclusion was a UX
  choice, not a privacy gate, and the Notes tab is exactly the place bodies
  belong. The Recent updates tab keeps answering "what care activity
  happened"; Notes answers "what's written that I may read" (this amends
  #477's four-tab doctrine to five).

This is also the consolidation amendment to ADR 0010's surface budget: the tab
reuses the existing reads idioms (column allowlists exported from
`care-note-reads.ts`), the existing NoteCard idiom, and the existing
transparency toggle — no new write paths.

### 3. A presence-only carve-out: sealed-note **counts**

RLS withholds sealed rows entirely, so an admin could not even see that sealed
notes _exist_. The Notes tab leads with a sealed summary — "Anderson Lee: 2
care notes · 1 prayer request sealed" — with the per-leader transparency
toggle inline, so revealing is one click.

The counts come from one new count-only `SECURITY DEFINER` read,
`admin_sealed_note_counts()` (migration `20260701010000`):

- Gate: `auth_is_admin()` — **Ministry Admin and Super Admin see identical
  counts**; there is no super-admin bypass, mirroring the read policies.
- Grouping follows ADR 0020's two arms exactly: profile-subject rows count
  under their **subject**, group-subject rows under their **author** (the
  gating leader either way — `coalesce(subject_profile_id,
author_profile_id)` under the XOR constraint).
- Rows the caller authored are excluded (the author already reads them).
- **Counts only.** No bodies, dates, authors, or group ids leave the function.
  This is a deliberate, bounded presence exception — it reveals _that_ and
  _how many_, never _what_ — recorded here so it is never widened casually.
  The SC.4 encrypted Private Care Note (ADR 0003) is untouched and never
  counted.

### 4. Inline writing and grading from the Care accordion

Each leader panel in the Care accordion hosts a collapsed "Grades & notes"
section with the **same** components and audited write paths the per-leader
detail page uses: `LeaderHealthGradeEditor`, one `GroupRubricGradeEntry` per
led group, and the two `CareNoteWriteForm`s (which work for admins after
decision 1). Seeded from the grade rows the accordion enrichment already
fetched — zero extra reads — and mirroring the detail page's off-season and
reload-before-editing guards. Grading itself stays Ministry-Admin/Super-Admin
only (ADR 0018 unchanged).

## Deferred

- An Over-Shepherd home aggregate of their own notes across covered leaders
  (their per-leader pages already read back their own notes).
- Feed pagination: v1 caps each source at ~100 rows, newest first.

## Consequences

- Audit dashboards keep working: the action labels
  (`admin.care_note.write`, `admin.prayer_request.write`) are unchanged even
  though the author set widened; the actor column tells the roles apart.
- The session guard for the two write actions is now
  `requireOverShepherdOrAdminSession`; the RPC's in-body gate remains the real
  boundary.
- Static migration tests pin the widened-but-bounded author gate, the
  counts-only return shape of `admin_sealed_note_counts`, and that neither
  migration touches a read policy.
