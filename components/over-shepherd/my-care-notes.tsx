import { formatIsoDateOr } from "@/lib/shared/date";
import type { CareNotesRow, PrayerRequestsRow } from "@/types/database";

// Pivot slice 9 (#381 / ADR 0017) — the Over-Shepherd author's OWN Care Notes +
// Prayer Requests about a Leader they cover, read back so they can see and verify
// what they saved. These are author-private: RLS returns the caller's own rows
// here regardless of the transparency toggle (which only governs whether ministry
// leadership may peek). Read-only; no transparency toggle (that lives in admin
// Care). The rows are fetched in the page and passed in (server component).

// Group labels are sentence case (tracked-uppercase is reserved for form field
// labels — docs/design-direction.md §2); meta lines are text-sm ink3.
const GROUP_LABEL = "mb-2 block font-sans text-sm font-semibold text-ink3";

const EMPTY_TEXT = "m-0 font-sans text-sm text-ink3";

function NoteCard({ body, createdAt }: { body: string; createdAt: string }) {
  return (
    <li className="mt-3 list-none border-t border-lineSoft pt-3">
      <p className="m-0 whitespace-pre-wrap font-sans text-base text-ink">
        {body}
      </p>
      <p className="m-0 mt-1.5 font-sans text-sm text-ink3">
        Recorded {formatIsoDateOr(createdAt, "—")}
      </p>
    </li>
  );
}

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
      <div>
        <span className={GROUP_LABEL}>
          Your care notes ({careNotes.length})
        </span>
        {careNotes.length === 0 ? (
          <p className={EMPTY_TEXT}>No care notes yet.</p>
        ) : (
          <ul className="m-0 p-0">
            {careNotes.map((n) => (
              <NoteCard key={n.id} body={n.body} createdAt={n.created_at} />
            ))}
          </ul>
        )}
      </div>
      <div>
        <span className={GROUP_LABEL}>
          Your prayer requests ({prayerRequests.length})
        </span>
        {prayerRequests.length === 0 ? (
          <p className={EMPTY_TEXT}>No prayer requests yet.</p>
        ) : (
          <ul className="m-0 p-0">
            {prayerRequests.map((r) => (
              <NoteCard key={r.id} body={r.body} createdAt={r.created_at} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
