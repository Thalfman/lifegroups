import Link from "next/link";
import type { CSSProperties } from "react";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import { formatIsoDate } from "@/lib/shared/date";
import type { ShepherdCareDirectoryEntry } from "@/lib/supabase/read-models";
import { ShepherdCareStatusBadge } from "@/components/admin/shepherd-care/status-badge";

// Focused "My Shepherds" directory for the Over-Shepherd surface. A relabeled
// clone of the admin directory table that drops the "Over-shepherd" column
// (the viewer IS the over-shepherd) and links into the /over-shepherd care
// history rather than /admin. Reuses the shared status badge + date format.

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontFamily: fontBody,
  fontSize: 13,
  color: P.ink,
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontFamily: fontSans,
  fontSize: 11,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  color: P.ink3,
  fontWeight: 600,
  borderBottom: `1px solid ${P.line}`,
  background: P.bgDeep,
};

const tdStyle: CSSProperties = {
  padding: "12px 12px",
  borderBottom: `1px solid ${P.line2}`,
  verticalAlign: "middle",
};

const emptyStyle: CSSProperties = {
  padding: "32px 12px",
  textAlign: "center",
  color: P.ink3,
  fontSize: 13,
};

const roleLabel: Record<string, string> = {
  leader: "Shepherd",
  co_leader: "Co-shepherd",
};

export function MyShepherdsTable({
  entries,
}: {
  entries: ShepherdCareDirectoryEntry[];
}) {
  if (entries.length === 0) {
    return (
      <div style={emptyStyle}>
        No Shepherds are assigned to your care yet.
      </div>
    );
  }
  return (
    <div
      className="lg-m-table-wrap"
      style={{ overflowX: "auto", border: `1px solid ${P.line}`, borderRadius: 10 }}
    >
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Shepherd</th>
            <th style={thStyle}>Role</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Last contact</th>
            <th style={thStyle}>Next touchpoint</th>
            <th style={thStyle}>Attention</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const status = entry.care?.current_status ?? "healthy";
            const lastContact = entry.care?.last_contact_at ?? null;
            const nextTouchpoint = entry.care?.next_touchpoint_due ?? null;
            return (
              <tr key={entry.profile.id}>
                <td style={tdStyle}>
                  <Link
                    href={`/over-shepherd/${entry.profile.id}`}
                    style={{ color: P.ink, fontWeight: 600, textDecoration: "none" }}
                  >
                    {entry.profile.full_name}
                  </Link>
                  <div style={{ color: P.ink3, fontSize: 12 }}>
                    {entry.profile.email}
                  </div>
                </td>
                <td style={tdStyle}>
                  {roleLabel[entry.profile.role] ?? entry.profile.role}
                </td>
                <td style={tdStyle}>
                  {entry.care ? (
                    <ShepherdCareStatusBadge status={status} />
                  ) : (
                    <span style={{ color: P.ink3 }}>—</span>
                  )}
                </td>
                <td style={tdStyle}>
                  {lastContact ? (
                    formatIsoDate(lastContact)
                  ) : (
                    <span style={{ color: P.ink3 }}>Never</span>
                  )}
                </td>
                <td style={tdStyle}>
                  {nextTouchpoint ? formatIsoDate(nextTouchpoint) : "—"}
                </td>
                <td style={tdStyle}>
                  {entry.needs_attention ? (
                    <span
                      title="Needs attention"
                      style={{
                        display: "inline-block",
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background: P.terra,
                      }}
                      aria-label="Needs attention"
                    />
                  ) : (
                    <span style={{ color: P.ink3 }}>—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
