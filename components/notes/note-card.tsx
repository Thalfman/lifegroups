import { Badge, type BadgeTone } from "@/components/ui/badge";
import {
  prayerRequestStatusChipLabel,
  type PrayerRequestStatus,
} from "@/lib/admin/prayer-request-status";
import { formatIsoDateOr } from "@/lib/shared/date";

// The Care Note surface kit (ADR 0036, 2026-07-06 review candidate 2). The
// write lifecycle was already shared (useActionForm); this module shares the
// rendered READ surface — note card, labeled list with empty state, prayer
// status chip — that the three oversight-ladder tiers (Ministry Admin,
// Over-Shepherd, Shepherd) had each hand-copied. Tiers configure copy; the
// markup lives once. Server-safe on purpose (no hooks, no directive): the
// admin Care section and the Over-Shepherd "my notes" surface are server
// components, while the client notes feed imports the tokens/chip only.

export const noteBodyClassName =
  "m-0 whitespace-pre-wrap font-sans text-base text-ink";

export const noteListLabelClassName =
  "mb-2 block font-sans text-xs font-medium text-ink3";

export const noteEmptyTextClassName = "m-0 font-sans text-sm text-ink3";

// Issue #474 (plan P2.3) — read-only status chip on a Prayer Request card.
// On the shared Badge vocabulary: answered reads as good news (sage),
// archived as a quiet resting state (neutral). Open requests render no chip
// at all — open is the default, not a signal.
const CHIP_TONES: Record<"answered" | "archived", BadgeTone> = {
  answered: "sage",
  archived: "neutral",
};

export function PrayerStatusChip({
  status,
  className,
}: {
  status: PrayerRequestStatus;
  className?: string;
}) {
  if (status === "open") return null;
  return (
    <Badge tone={CHIP_TONES[status]} className={className}>
      {prayerRequestStatusChipLabel(status)}
    </Badge>
  );
}

// A minimal view shape, deliberately not a DB row type: each tier maps its
// rows (CareNotesRow / PrayerRequestsRow / AuthoredGroupNote) into this, so
// the card stays decoupled from what a surface is allowed to read.
export type NoteCardView = {
  body: string;
  recordedAtIso: string;
  // Where the note points (e.g. the group name on a leader-authored note).
  context?: string;
  // Only Prayer Requests carry a status; Care Notes never pass this.
  prayerStatus?: PrayerRequestStatus;
};

export function NoteCard({
  body,
  recordedAtIso,
  context,
  prayerStatus,
}: NoteCardView) {
  return (
    <li className="mt-3 list-none border-t border-lineSoft pt-3">
      {prayerStatus ? (
        <PrayerStatusChip status={prayerStatus} className="mb-1.5" />
      ) : null}
      <p className={noteBodyClassName}>{body}</p>
      <p className="m-0 mt-1.5 font-sans text-xs text-ink3">
        {context ? `${context} · ` : ""}
        Recorded {formatIsoDateOr(recordedAtIso, "—")}
      </p>
    </li>
  );
}

// The labeled-list-with-empty-state idiom, once: "{label} ({count})" over an
// empty-state line or a list of cards.
export function NoteList({
  label,
  emptyText,
  items,
}: {
  label: string;
  emptyText: string;
  items: ({ id: string } & NoteCardView)[];
}) {
  return (
    <div>
      <span className={noteListLabelClassName}>
        {label} ({items.length})
      </span>
      {items.length === 0 ? (
        <p className={noteEmptyTextClassName}>{emptyText}</p>
      ) : (
        <ul className="m-0 p-0">
          {items.map((item) => (
            <NoteCard
              key={item.id}
              body={item.body}
              recordedAtIso={item.recordedAtIso}
              context={item.context}
              prayerStatus={item.prayerStatus}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
