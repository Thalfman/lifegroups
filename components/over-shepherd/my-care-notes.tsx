import { NoteList } from "@/components/notes/note-card";
import type { CareNotesRow, PrayerRequestsRow } from "@/types/database";

// Pivot slice 9 (#381 / ADR 0017) — the Over-Shepherd author's OWN Care Notes +
// Prayer Requests about a Leader they cover, read back so they can see and verify
// what they saved. These are author-private: RLS returns the caller's own rows
// here regardless of the transparency toggle (which only governs whether ministry
// leadership may peek). Read-only; no transparency toggle (that lives in admin
// Care). The rows are fetched in the page and passed in (server component).
//
// Renders through the shared Care Note surface kit (ADR 0036), which owns the
// card / labeled-list markup and its canonical label sizing.
export function MyCareNotes({
  careNotes,
  prayerRequests,
}: {
  careNotes: CareNotesRow[];
  prayerRequests: PrayerRequestsRow[];
}) {
  return (
    <div className="grid gap-4">
      <p className="m-0 font-sans text-sm text-ink2">
        Your notes &amp; prayer requests below are private to you. Ministry
        leadership can read them only when this Leader&apos;s transparency
        toggle is turned on.
      </p>
      <NoteList
        label="Your care notes"
        emptyText="No care notes yet."
        items={careNotes.map((n) => ({
          id: n.id,
          body: n.body,
          recordedAtIso: n.created_at,
        }))}
      />
      <NoteList
        label="Your prayer requests"
        emptyText="No prayer requests yet."
        items={prayerRequests.map((r) => ({
          id: r.id,
          body: r.body,
          recordedAtIso: r.created_at,
        }))}
      />
    </div>
  );
}
