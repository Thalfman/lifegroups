import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { P, fontBody, fontSans } from "@/lib/pastoral";
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

const slotLabelStyle: CSSProperties = {
  margin: 0,
  fontFamily: fontSans,
  fontSize: 10,
  letterSpacing: 0.8,
  textTransform: "uppercase",
  fontWeight: 700,
  color: P.ink3,
};

const valueTextStyle: CSSProperties = {
  fontFamily: fontBody,
  fontSize: 12.5,
  color: P.ink,
};

const mutedTextStyle: CSSProperties = {
  fontFamily: fontBody,
  fontSize: 12.5,
  fontStyle: "italic",
  color: P.ink3,
};

// A small A–F letter pill. D / F read as a concern (terra tint); A–C are neutral.
function LetterBadge({ letter }: { letter: string }) {
  const concern = letter === "D" || letter === "F";
  return (
    <span
      style={{
        display: "inline-flex",
        minWidth: 18,
        justifyContent: "center",
        fontFamily: fontSans,
        fontSize: 12,
        fontWeight: 700,
        color: concern ? P.terraTextStrong : P.ink,
        background: concern ? P.terraSoft : P.bg,
        border: `1px solid ${concern ? P.terraSoft : P.line}`,
        borderRadius: 6,
        padding: "1px 6px",
      }}
    >
      {letter}
    </span>
  );
}

function Slot({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 5 }}>
      <p style={slotLabelStyle}>{label}</p>
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
    return <span style={mutedTextStyle}>None yet.</span>;
  }
  const parts = [
    `${notes.careNoteCount} care note${notes.careNoteCount === 1 ? "" : "s"}`,
    `${notes.prayerCount} prayer request${notes.prayerCount === 1 ? "" : "s"}`,
  ];
  return <span style={valueTextStyle}>{parts.join(" · ")}</span>;
}

export function CareLeaderPanel({ leader }: { leader: CareAccordionLeader }) {
  const groupLabel =
    leader.groupNames.length > 0 ? leader.groupNames.join(", ") : "No group";
  const granted = isNoteTransparencyGranted(leader.notes);

  return (
    <details
      style={{
        background: P.surface,
        border: `1px solid ${P.line2}`,
        borderRadius: 10,
      }}
    >
      <summary
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "10px 14px",
          cursor: "pointer",
        }}
      >
        <span style={{ minWidth: 0, display: "grid", gap: 2 }}>
          <span
            style={{
              fontFamily: fontSans,
              fontSize: 13.5,
              fontWeight: 600,
              color: P.ink,
              overflowWrap: "anywhere",
            }}
          >
            {leader.fullName}
          </span>
          <span style={{ fontFamily: fontBody, fontSize: 12, color: P.ink3 }}>
            {groupLabel}
          </span>
        </span>
        {leader.careStatus ? (
          <ShepherdCareStatusBadge status={leader.careStatus} />
        ) : (
          <span
            style={{
              fontFamily: fontBody,
              fontSize: 11.5,
              fontStyle: "italic",
              color: P.ink3,
              whiteSpace: "nowrap",
            }}
          >
            No care status yet
          </span>
        )}
      </summary>

      <div style={{ display: "grid", gap: 14, padding: "4px 14px 16px" }}>
        {/* At-a-glance, mirroring the spreadsheet row (Last contact / Next step).
            Both come straight from the care directory row — no extra read. */}
        <div
          className="lg-m-grid-stack"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 12,
          }}
        >
          <Slot label="Last contact">
            <span style={valueTextStyle}>
              {formatIsoDateOr(leader.lastContactAt, "Never")}
            </span>
          </Slot>
          <Slot label="Next step">
            <span style={valueTextStyle}>
              {formatIsoDateOr(leader.nextStepDue)}
            </span>
          </Slot>
        </div>

        <Slot label="Leader Care Status">
          {leader.careStatus ? (
            <ShepherdCareStatusBadge status={leader.careStatus} />
          ) : (
            <span style={mutedTextStyle}>No care status set yet.</span>
          )}
        </Slot>

        <div
          className="lg-m-grid-stack"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          <Slot label="Group-Health Grade">
            {leader.ledGroups.length === 0 ? (
              <span style={mutedTextStyle}>No active group.</span>
            ) : (
              <div style={{ display: "grid", gap: 4 }}>
                {leader.ledGroups.map((g) => (
                  <span
                    key={g.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      ...valueTextStyle,
                    }}
                  >
                    {g.healthGrade ? (
                      <LetterBadge letter={g.healthGrade} />
                    ) : (
                      <span style={mutedTextStyle}>Not graded</span>
                    )}
                    <span style={{ color: P.ink2, overflowWrap: "anywhere" }}>
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
              <span style={mutedTextStyle}>Not graded</span>
            )}
          </Slot>

          <Slot label="Care Notes & Prayer">
            <div style={{ display: "grid", gap: 8 }}>
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
          style={{
            justifySelf: "start",
            fontFamily: fontSans,
            fontSize: 12.5,
            fontWeight: 600,
            color: P.sageTextStrong,
            textDecoration: "none",
            border: `1px solid ${P.line}`,
            borderRadius: 999,
            padding: "6px 14px",
          }}
        >
          Open leader care →
        </Link>
      </div>
    </details>
  );
}
