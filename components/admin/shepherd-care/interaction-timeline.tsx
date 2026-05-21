import type { CSSProperties } from "react";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import { shepherdCareInteractionTypeLabel } from "@/lib/dashboard/labels";
import { formatIsoDate } from "@/lib/shared/date";
import type { ShepherdCareInteractionsRow } from "@/types/database";

const itemStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  gap: 16,
  padding: "14px 0",
  borderBottom: `1px solid ${P.line2}`,
};

const stampStyle: CSSProperties = {
  fontFamily: fontSans,
  fontSize: 11,
  letterSpacing: 1,
  textTransform: "uppercase",
  color: P.ink3,
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const typeStyle: CSSProperties = {
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  background: P.bgDeep,
  color: P.ink2,
  border: `1px solid ${P.line}`,
  marginBottom: 6,
};

const notesStyle: CSSProperties = {
  fontFamily: fontBody,
  fontSize: 14,
  color: P.ink,
  margin: 0,
  whiteSpace: "pre-wrap",
};

const emptyStyle: CSSProperties = {
  padding: "20px 0",
  color: P.ink3,
  fontFamily: fontBody,
  fontSize: 13,
};

export function InteractionTimeline({
  interactions,
}: {
  interactions: ShepherdCareInteractionsRow[];
}) {
  if (interactions.length === 0) {
    return <div style={emptyStyle}>No interactions logged yet.</div>;
  }
  return (
    <div role="list">
      {interactions.map((row) => (
        <div key={row.id} role="listitem" style={itemStyle}>
          <div style={stampStyle}>{formatIsoDate(row.interaction_at)}</div>
          <div>
            <div style={typeStyle}>
              {shepherdCareInteractionTypeLabel(row.interaction_type)}
            </div>
            {row.notes ? (
              <p style={notesStyle}>{row.notes}</p>
            ) : (
              <p style={{ ...notesStyle, color: P.ink3, fontStyle: "italic" }}>
                No notes recorded.
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
