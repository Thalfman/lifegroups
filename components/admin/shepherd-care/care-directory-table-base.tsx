import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import { formatIsoDate } from "@/lib/shared/date";
import type { ShepherdCareDirectoryEntry } from "@/lib/supabase/read-models";
import { ShepherdCareStatusBadge } from "./status-badge";

// Shared presentational care-directory table. Both the admin directory (with
// an "Over-shepherd" coverage column) and the Over-Shepherd "My Shepherds"
// table render the same styling, status/last-contact/next-touchpoint/attention
// cells; only the first-column label, link target, role labels, empty text,
// and an optional extra column differ. Those are passed as props so the markup
// + styles live in one place.

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

// An optional column inserted after "Role" (e.g. the admin "Over-shepherd"
// coverage column). The header is fixed text; render() produces each cell.
export type CareDirectoryExtraColumn = {
  header: string;
  render: (entry: ShepherdCareDirectoryEntry) => ReactNode;
};

export function CareDirectoryTable({
  entries,
  firstColumnLabel,
  roleLabels,
  hrefForEntry,
  emptyText,
  extraColumn,
}: {
  entries: ShepherdCareDirectoryEntry[];
  firstColumnLabel: string;
  roleLabels: Record<string, string>;
  hrefForEntry: (entry: ShepherdCareDirectoryEntry) => string;
  emptyText: string;
  extraColumn?: CareDirectoryExtraColumn;
}) {
  if (entries.length === 0) {
    return <div style={emptyStyle}>{emptyText}</div>;
  }
  return (
    <div
      className="lg-m-table-wrap"
      style={{ overflowX: "auto", border: `1px solid ${P.line}`, borderRadius: 10 }}
    >
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>{firstColumnLabel}</th>
            <th style={thStyle}>Role</th>
            {extraColumn ? <th style={thStyle}>{extraColumn.header}</th> : null}
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Last contact</th>
            <th style={thStyle}>Next touchpoint</th>
            <th style={thStyle}>Attention</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const status = entry.care?.current_status ?? "doing_well";
            const lastContact = entry.care?.last_contact_at ?? null;
            const nextTouchpoint = entry.care?.next_touchpoint_due ?? null;
            return (
              <tr key={entry.profile.id}>
                <td style={tdStyle}>
                  <Link
                    href={hrefForEntry(entry)}
                    style={{ color: P.ink, fontWeight: 600, textDecoration: "none" }}
                  >
                    {entry.profile.full_name}
                  </Link>
                  <div style={{ color: P.ink3, fontSize: 12 }}>
                    {entry.profile.email}
                  </div>
                </td>
                <td style={tdStyle}>
                  {roleLabels[entry.profile.role] ?? entry.profile.role}
                </td>
                {extraColumn ? (
                  <td style={tdStyle}>{extraColumn.render(entry)}</td>
                ) : null}
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
