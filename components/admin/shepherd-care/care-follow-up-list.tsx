import type { CSSProperties } from "react";
import { CareFollowUpStatusControls } from "@/components/admin/shepherd-care/care-follow-up-status-controls";
import { shepherdCareFollowUpStatusLabel } from "@/lib/dashboard/labels";
import { formatIsoDate } from "@/lib/shared/date";
import {
  isFollowUpOverdue,
  sortFollowUpsByUrgency,
} from "@/lib/admin/shepherd-care-follow-ups";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import type { ShepherdCareFollowUpsRow } from "@/types/database";

const itemStyle: CSSProperties = {
  padding: "14px 0",
  borderBottom: `1px solid ${P.line2}`,
};

const titleStyle: CSSProperties = {
  fontFamily: fontSans,
  fontSize: 14,
  fontWeight: 600,
  color: P.ink,
  margin: 0,
  overflowWrap: "anywhere",
};

const metaRowStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  flexWrap: "wrap",
  marginTop: 6,
};

const badgeBase: CSSProperties = {
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  fontFamily: fontSans,
};

const dueStyle: CSSProperties = {
  fontFamily: fontBody,
  fontSize: 12.5,
  color: P.ink2,
};

const notesStyle: CSSProperties = {
  fontFamily: fontBody,
  fontSize: 14,
  color: P.ink,
  margin: "8px 0 0",
  whiteSpace: "pre-wrap",
};

const emptyStyle: CSSProperties = {
  padding: "20px 0",
  color: P.ink3,
  fontFamily: fontBody,
  fontSize: 13,
};

function statusBadgeTone(
  status: ShepherdCareFollowUpsRow["status"],
  overdue: boolean
): CSSProperties {
  if (overdue) {
    return {
      background: P.terraSoft,
      color: "#923220",
      border: "1px solid #e4b9a8",
    };
  }
  switch (status) {
    case "done":
      return {
        background: P.sageSoft,
        color: "#3e4f29",
        border: `1px solid ${P.line}`,
      };
    case "in_progress":
      return {
        background: P.mustardSoft,
        color: P.mustardTextStrong,
        border: "1px solid #efdfa3",
      };
    case "open":
    default:
      return {
        background: P.bgDeep,
        color: P.ink2,
        border: `1px solid ${P.line}`,
      };
  }
}

export function CareFollowUpList({
  followUps,
  shepherdProfileId,
  todayIso,
}: {
  followUps: ShepherdCareFollowUpsRow[];
  shepherdProfileId: string;
  todayIso: string;
}) {
  if (followUps.length === 0) {
    return <div style={emptyStyle}>No follow-ups yet.</div>;
  }
  const ordered = sortFollowUpsByUrgency(followUps, todayIso);
  return (
    <div role="list">
      {ordered.map((row) => {
        const overdue = isFollowUpOverdue(row, todayIso);
        return (
          <div key={row.id} role="listitem" style={itemStyle}>
            <p style={titleStyle}>{row.title}</p>
            <div style={metaRowStyle}>
              <span
                style={{
                  ...badgeBase,
                  ...statusBadgeTone(row.status, overdue),
                }}
              >
                {overdue
                  ? "Overdue"
                  : shepherdCareFollowUpStatusLabel(row.status)}
              </span>
              <span style={dueStyle}>
                {row.due_date
                  ? `Due ${formatIsoDate(row.due_date)}`
                  : "No due date"}
              </span>
              {row.status === "done" && row.completed_at ? (
                <span
                  style={{ ...dueStyle, color: P.ink3, fontStyle: "italic" }}
                >
                  Done {formatIsoDate(row.completed_at.slice(0, 10))}
                </span>
              ) : null}
            </div>
            {row.notes ? <p style={notesStyle}>{row.notes}</p> : null}
            <div style={{ marginTop: 10 }}>
              <CareFollowUpStatusControls
                followUpId={row.id}
                followUpTitle={row.title}
                status={row.status}
                shepherdProfileId={shepherdProfileId}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
