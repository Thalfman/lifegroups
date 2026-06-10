import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { buttonClassName } from "@/components/ui/button";
import { formatIsoDateOr } from "@/lib/shared/date";
import { ShepherdCareStatusBadge } from "@/components/admin/shepherd-care/status-badge";
import { NoteTransparencyToggle } from "@/components/admin/shepherd-care/note-transparency-toggle";
import {
  isNoteTransparencyGranted,
  type CareAccordionLeader,
} from "@/lib/admin/care-accordion";

// The per-Leader detail inside a Care accordion pane (#373, ADR 0016). Opened
// (it lives behind its own <details>), it shows an at-a-glance contact line
// (the spreadsheet's Last contact / Next step), the Leader's pastoral Leader
// Care Status, and the four slots that were placeholders until #377/#378/#381:
// the Group-Health Grade(s), the Leader-Health Grade, and the Care Notes /
// Prayer Requests presence. The slots read from the accordion model's enrichment
// (no per-leader reads here); the Leader name still links into the full
// per-leader detail surface where the actual care work happens. The Care Notes
// & Prayer slot also hosts the inline transparency toggle (#467) — the same
// audited control the detail page uses — so the Ministry Admin can flip a
// Leader's grant without leaving the accordion. The slot stays counts-only:
// note and Prayer Request bodies never render here.

const SLOT_LABEL = "m-0 font-sans text-xs font-medium text-ink3";
const VALUE_TEXT = "font-sans text-sm text-ink";
const MUTED_TEXT = "font-sans text-sm italic text-ink3";

// A small A–F letter pill. D / F read as a concern (clay tint); A–C are neutral.
function LetterBadge({ letter }: { letter: string }) {
  const concern = letter === "D" || letter === "F";
  return (
    <span
      className={cn(
        "inline-flex min-w-[18px] justify-center rounded border px-1.5 py-px font-sans text-xs font-bold",
        concern
          ? "border-claySoft bg-claySoft text-clayDeep"
          : "border-line bg-bg text-ink"
      )}
    >
      {letter}
    </span>
  );
}

function Slot({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <p className={SLOT_LABEL}>{label}</p>
      <div>{children}</div>
    </div>
  );
}

// "N care note(s) · M prayer request(s)", or a none-yet line. Rendered only
// when the Leader's transparency grant is on; never a note body — only counts
// behind the RLS grant. Sealed Leaders skip this line entirely: the inline
// toggle below carries the sealed state instead (#467).
function CareNoteCounts({ notes }: { notes: CareAccordionLeader["notes"] }) {
  if (notes.careNoteCount === 0 && notes.prayerCount === 0) {
    return <span className={MUTED_TEXT}>None yet.</span>;
  }
  const parts = [
    `${notes.careNoteCount} care note${notes.careNoteCount === 1 ? "" : "s"}`,
    `${notes.prayerCount} prayer request${notes.prayerCount === 1 ? "" : "s"}`,
  ];
  return <span className={VALUE_TEXT}>{parts.join(" · ")}</span>;
}

export function CareLeaderPanel({ leader }: { leader: CareAccordionLeader }) {
  const groupLabel =
    leader.groupNames.length > 0 ? leader.groupNames.join(", ") : "No group";
  const granted = isNoteTransparencyGranted(leader.notes);

  return (
    <details className="rounded-sm border border-lineSoft bg-surface">
      <summary className="flex cursor-pointer items-center justify-between gap-3 rounded-sm px-3.5 py-2.5 transition-colors duration-150 hover:bg-surfaceAlt">
        <span className="grid min-w-0 gap-0.5">
          <span className="font-sans text-base font-semibold text-ink [overflow-wrap:anywhere]">
            {leader.fullName}
          </span>
          <span className="font-sans text-sm text-ink3">{groupLabel}</span>
        </span>
        {leader.careStatus ? (
          <ShepherdCareStatusBadge status={leader.careStatus} />
        ) : (
          <span className={cn(MUTED_TEXT, "whitespace-nowrap")}>
            No care status yet
          </span>
        )}
      </summary>

      <div className="grid gap-3.5 px-3.5 pb-4 pt-1">
        {/* At-a-glance, mirroring the spreadsheet row (Last contact / Next step).
            Both come straight from the care directory row — no extra read. */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[repeat(auto-fit,minmax(140px,1fr))]">
          <Slot label="Last contact">
            <span className={VALUE_TEXT}>
              {formatIsoDateOr(leader.lastContactAt, "Never")}
            </span>
          </Slot>
          <Slot label="Next step">
            <span className={VALUE_TEXT}>
              {formatIsoDateOr(leader.nextStepDue)}
            </span>
          </Slot>
        </div>

        <Slot label="Leader Care Status">
          {leader.careStatus ? (
            <ShepherdCareStatusBadge status={leader.careStatus} />
          ) : (
            <span className={MUTED_TEXT}>No care status set yet.</span>
          )}
        </Slot>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
          <Slot label="Group-Health Grade">
            {leader.ledGroups.length === 0 ? (
              <span className={MUTED_TEXT}>No active group.</span>
            ) : (
              <div className="grid gap-1">
                {leader.ledGroups.map((g) => (
                  <span
                    key={g.id}
                    className={cn("flex items-center gap-1.5", VALUE_TEXT)}
                  >
                    {g.healthGrade ? (
                      <LetterBadge letter={g.healthGrade} />
                    ) : (
                      <span className={MUTED_TEXT}>Not graded</span>
                    )}
                    <span className="text-ink2 [overflow-wrap:anywhere]">
                      {g.name}
                    </span>
                  </span>
                ))}
              </div>
            )}
          </Slot>

          <Slot label="Leader-Health Grade">
            {leader.leaderHealthGrade ? (
              <LetterBadge letter={leader.leaderHealthGrade} />
            ) : (
              <span className={MUTED_TEXT}>Not graded</span>
            )}
          </Slot>

          <Slot label="Care Notes & Prayer">
            <div className="grid gap-2">
              {granted ? <CareNoteCounts notes={leader.notes} /> : null}
              {/* #467 — the same Ministry-Admin-controlled toggle the
                  per-leader detail page renders (one audited write path:
                  setNoteTransparencyGrant → set_note_transparency_grant
                  RPC). Its revalidate list covers /admin/care, so a flip
                  re-renders this panel in the new state. */}
              <NoteTransparencyToggle
                subjectProfileId={leader.profileId}
                granted={granted}
                subjectName={leader.fullName}
              />
            </div>
          </Slot>
        </div>

        <Link
          href={`/admin/shepherd-care/${leader.profileId}`}
          className={buttonClassName("ghost", "sm", "justify-self-start")}
        >
          Open leader care →
        </Link>
      </div>
    </details>
  );
}
