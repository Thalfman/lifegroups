import { NoteTransparencyToggle } from "@/components/admin/shepherd-care/note-transparency-toggle";
import { NoteList, noteEmptyTextClassName } from "@/components/notes/note-card";
import type { PrayerRequestStatus } from "@/lib/admin/prayer-request-status";
import type { CareNotesRow, PrayerRequestsRow } from "@/types/database";

// Pivot slice 9 (#381 / ADR 0017) — admin Care surface section. Shows the inline
// per-person transparency toggle (Ministry-Admin controlled) plus the Care Notes
// and Prayer Requests this viewer is allowed to read. The reads are already
// RLS-filtered: the ladder sees a subject's sealed notes ONLY when the toggle is
// on, so when `granted` is false the lists below are empty by construction (the
// notes exist but RLS withholds them). The section explains that state inline.
//
// This is a server component: the data is fetched in the page and passed in; the
// only client island is the toggle itself. The note card / labeled-list markup
// lives in the shared Care Note surface kit (ADR 0036).

// Pivot slice 11 (#382 / ADR 0020): a Care Note / Prayer Request this leader
// wrote ABOUT one of their groups. Carries the group name for context, and —
// for Prayer Requests only (#474) — the pastoral status behind the chip.
export type AuthoredGroupNote = {
  id: string;
  body: string;
  created_at: string;
  groupName: string;
  status?: PrayerRequestStatus;
};

function AuthoredGroupNotes({
  careNotes,
  prayerRequests,
}: {
  careNotes: AuthoredGroupNote[];
  prayerRequests: AuthoredGroupNote[];
}) {
  return (
    <div className="grid gap-4 border-t border-line pt-4">
      <p className="m-0 font-sans text-sm text-ink2">
        Notes this shepherd wrote about their own group(s). Same toggle gates
        them. They&apos;re sealed to the shepherd until it&apos;s on.
      </p>
      <NoteList
        label="About their group"
        emptyText="No group care notes yet."
        items={careNotes.map((n) => ({
          id: n.id,
          body: n.body,
          recordedAtIso: n.created_at,
          context: n.groupName,
        }))}
      />
      <NoteList
        label="Prayer for their group"
        emptyText="No group prayer requests yet."
        items={prayerRequests.map((r) => ({
          id: r.id,
          body: r.body,
          recordedAtIso: r.created_at,
          context: r.groupName,
          prayerStatus: r.status,
        }))}
      />
    </div>
  );
}

export function CareNotesSection({
  subjectProfileId,
  granted,
  careNotes,
  prayerRequests,
  authoredGroupCareNotes = [],
  authoredGroupPrayerRequests = [],
}: {
  subjectProfileId: string;
  granted: boolean;
  careNotes: CareNotesRow[];
  prayerRequests: PrayerRequestsRow[];
  // Pivot slice 11 (#382 / ADR 0020): notes this leader authored about their
  // group(s). Same per-leader toggle gates them; default empty (sealed).
  authoredGroupCareNotes?: AuthoredGroupNote[];
  authoredGroupPrayerRequests?: AuthoredGroupNote[];
}) {
  const hasAuthoredGroupNotes =
    authoredGroupCareNotes.length > 0 || authoredGroupPrayerRequests.length > 0;
  return (
    <section className="grid gap-4 rounded-lg border border-line bg-surface p-card">
      <div>
        <h3 className="m-0 mb-1 font-display text-lg font-medium text-ink">
          Care notes &amp; prayer requests
        </h3>
        <p className="m-0 font-sans text-sm text-ink2">
          Over-shepherds write notes about this shepherd; this shepherd writes
          notes about their group. Both are private to their author &mdash;
          leadership can read them only when this person&apos;s transparency
          toggle is on.
        </p>
      </div>

      <NoteTransparencyToggle
        subjectProfileId={subjectProfileId}
        granted={granted}
      />

      {!granted ? (
        <p className={noteEmptyTextClassName}>
          This person&apos;s notes are sealed to their author. Turn the toggle
          on to let ministry leadership read them.
        </p>
      ) : (
        <>
          <NoteList
            label="Care notes"
            emptyText="No care notes yet."
            items={careNotes.map((n) => ({
              id: n.id,
              body: n.body,
              recordedAtIso: n.created_at,
            }))}
          />
          <NoteList
            label="Prayer requests"
            emptyText="No prayer requests yet."
            items={prayerRequests.map((r) => ({
              id: r.id,
              body: r.body,
              recordedAtIso: r.created_at,
              prayerStatus: r.status,
            }))}
          />
          {hasAuthoredGroupNotes ? (
            <AuthoredGroupNotes
              careNotes={authoredGroupCareNotes}
              prayerRequests={authoredGroupPrayerRequests}
            />
          ) : null}
        </>
      )}
    </section>
  );
}
