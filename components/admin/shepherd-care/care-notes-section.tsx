import { Badge, type BadgeTone } from "@/components/ui/badge";
import { NoteTransparencyToggle } from "@/components/admin/shepherd-care/note-transparency-toggle";
import {
  prayerRequestStatusChipLabel,
  type PrayerRequestStatus,
} from "@/lib/admin/prayer-request-status";
import { formatIsoDateOr } from "@/lib/shared/date";
import type { CareNotesRow, PrayerRequestsRow } from "@/types/database";

// Pivot slice 9 (#381 / ADR 0017) — admin Care surface section. Shows the inline
// per-person transparency toggle (Ministry-Admin controlled) plus the Care Notes
// and Prayer Requests this viewer is allowed to read. The reads are already
// RLS-filtered: the ladder sees a subject's sealed notes ONLY when the toggle is
// on, so when `granted` is false the lists below are empty by construction (the
// notes exist but RLS withholds them). The section explains that state inline.
//
// This is a server component: the data is fetched in the page and passed in; the
// only client island is the toggle itself.
const LABEL = "mb-2 block font-sans text-xs font-medium text-ink3";
const MUTED_NOTE = "m-0 font-sans text-sm text-ink3";

// Issue #474 (plan P2.3) — read-only status chip on a Prayer Request card.
// On the shared Badge vocabulary: answered reads as good news (sage),
// archived as a quiet resting state (neutral). Open requests render no chip
// at all — open is the default, not a signal.
const CHIP_TONES: Record<"answered" | "archived", BadgeTone> = {
  answered: "sage",
  archived: "neutral",
};

function PrayerStatusChip({ status }: { status: PrayerRequestStatus }) {
  if (status === "open") return null;
  return (
    <Badge tone={CHIP_TONES[status]} className="mb-1.5">
      {prayerRequestStatusChipLabel(status)}
    </Badge>
  );
}

function NoteCard({
  body,
  createdAt,
  context,
  prayerStatus,
}: {
  body: string;
  createdAt: string;
  context?: string;
  // Only Prayer Requests carry a status; Care Notes never pass this.
  prayerStatus?: PrayerRequestStatus;
}) {
  return (
    <li className="mt-3 list-none border-t border-lineSoft pt-3">
      {prayerStatus ? <PrayerStatusChip status={prayerStatus} /> : null}
      <p className="m-0 whitespace-pre-wrap font-sans text-base text-ink">
        {body}
      </p>
      <p className="m-0 mt-1.5 font-sans text-xs text-ink3">
        {context ? `${context} · ` : ""}
        Recorded {formatIsoDateOr(createdAt, "—")}
      </p>
    </li>
  );
}

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
        them — they&apos;re sealed to the shepherd until it&apos;s on.
      </p>
      <div>
        <span className={LABEL}>About their group ({careNotes.length})</span>
        {careNotes.length === 0 ? (
          <p className={MUTED_NOTE}>No group care notes yet.</p>
        ) : (
          <ul className="m-0 p-0">
            {careNotes.map((n) => (
              <NoteCard
                key={n.id}
                body={n.body}
                createdAt={n.created_at}
                context={n.groupName}
              />
            ))}
          </ul>
        )}
      </div>
      <div>
        <span className={LABEL}>
          Prayer for their group ({prayerRequests.length})
        </span>
        {prayerRequests.length === 0 ? (
          <p className={MUTED_NOTE}>No group prayer requests yet.</p>
        ) : (
          <ul className="m-0 p-0">
            {prayerRequests.map((r) => (
              <NoteCard
                key={r.id}
                body={r.body}
                createdAt={r.created_at}
                context={r.groupName}
                prayerStatus={r.status}
              />
            ))}
          </ul>
        )}
      </div>
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
        <p className={MUTED_NOTE}>
          This person&apos;s notes are sealed to their author. Turn the toggle
          on to let ministry leadership read them.
        </p>
      ) : (
        <>
          <div>
            <span className={LABEL}>Care notes ({careNotes.length})</span>
            {careNotes.length === 0 ? (
              <p className={MUTED_NOTE}>No care notes yet.</p>
            ) : (
              <ul className="m-0 p-0">
                {careNotes.map((n) => (
                  <NoteCard key={n.id} body={n.body} createdAt={n.created_at} />
                ))}
              </ul>
            )}
          </div>
          <div>
            <span className={LABEL}>
              Prayer requests ({prayerRequests.length})
            </span>
            {prayerRequests.length === 0 ? (
              <p className={MUTED_NOTE}>No prayer requests yet.</p>
            ) : (
              <ul className="m-0 p-0">
                {prayerRequests.map((r) => (
                  <NoteCard
                    key={r.id}
                    body={r.body}
                    createdAt={r.created_at}
                    prayerStatus={r.status}
                  />
                ))}
              </ul>
            )}
          </div>
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
