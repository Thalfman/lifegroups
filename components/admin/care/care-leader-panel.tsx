import Link from "next/link";
import type { CSSProperties } from "react";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import { ShepherdCareStatusBadge } from "@/components/admin/shepherd-care/status-badge";
import type { CareAccordionLeader } from "@/lib/admin/care-accordion";

// The per-Leader detail inside a Care accordion pane (#373, ADR 0016). Opened
// (it lives behind its own <details>), it shows the Leader's pastoral Leader
// Care Status plus four LABELLED PLACEHOLDER slots — Group-Health Grade,
// Leader-Health Grade, Care Notes, Prayer Requests — that later slices
// (#377/#378/#381) fill in. They are placeholders only: this slice is read-only
// consolidation and reads no grade/note/prayer data. The Leader name links into
// the existing per-leader detail surface (still resolvable under
// /admin/shepherd-care) where the actual care work happens.

const slotLabelStyle: CSSProperties = {
  margin: 0,
  fontFamily: fontSans,
  fontSize: 10,
  letterSpacing: 0.8,
  textTransform: "uppercase",
  fontWeight: 700,
  color: P.ink3,
};

const placeholderBoxStyle: CSSProperties = {
  background: P.bg,
  border: `1px dashed ${P.line}`,
  borderRadius: 8,
  padding: "10px 12px",
  fontFamily: fontBody,
  fontSize: 12.5,
  fontStyle: "italic",
  color: P.ink3,
};

// Each placeholder names the concept (so the slot is unmistakable in the UI and
// in the test surface) and says it's coming, without inventing any value.
function PlaceholderSlot({
  label,
  comingNote,
}: {
  label: string;
  comingNote: string;
}) {
  return (
    <div style={{ display: "grid", gap: 5 }}>
      <p style={slotLabelStyle}>{label}</p>
      <div style={placeholderBoxStyle}>{comingNote}</div>
    </div>
  );
}

export function CareLeaderPanel({ leader }: { leader: CareAccordionLeader }) {
  const groupLabel =
    leader.groupNames.length > 0 ? leader.groupNames.join(", ") : "No group";

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
        <div style={{ display: "grid", gap: 5 }}>
          <p style={slotLabelStyle}>Leader Care Status</p>
          <div>
            {leader.careStatus ? (
              <ShepherdCareStatusBadge status={leader.careStatus} />
            ) : (
              <span
                style={{
                  fontFamily: fontBody,
                  fontSize: 12.5,
                  fontStyle: "italic",
                  color: P.ink3,
                }}
              >
                No care status set yet.
              </span>
            )}
          </div>
        </div>

        <div
          className="lg-m-grid-stack"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
          }}
        >
          <PlaceholderSlot
            label="Group-Health Grade"
            comingNote="Group-Health Grade coming soon."
          />
          <PlaceholderSlot
            label="Leader-Health Grade"
            comingNote="Leader-Health Grade coming soon."
          />
          <PlaceholderSlot
            label="Care Notes"
            comingNote="Care Notes coming soon."
          />
          <PlaceholderSlot
            label="Prayer Requests"
            comingNote="Prayer Requests coming soon."
          />
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
