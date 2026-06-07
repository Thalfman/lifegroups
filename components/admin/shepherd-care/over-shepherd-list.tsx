import Link from "next/link";
import type { CSSProperties } from "react";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import type { OverShepherdListRow } from "@/lib/supabase/read-models";
import { OverShepherdArchiveButton } from "@/components/admin/shepherd-care/over-shepherd-archive-button";

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

export function OverShepherdList({
  overShepherds,
  shepherdCountById,
}: {
  overShepherds: OverShepherdListRow[];
  shepherdCountById: Map<string, number>;
}) {
  if (overShepherds.length === 0) {
    return <div style={emptyStyle}>No over-shepherds yet.</div>;
  }
  return (
    <div
      className="lg-m-table-wrap"
      style={{
        overflowX: "auto",
        border: `1px solid ${P.line}`,
        borderRadius: 10,
      }}
    >
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Name</th>
            <th style={thStyle}>Email</th>
            <th style={thStyle}>Phone</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>Leaders covered</th>
            <th style={thStyle}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {overShepherds.map((os) => {
            const count = shepherdCountById.get(os.id) ?? 0;
            return (
              <tr key={os.id}>
                <td style={tdStyle}>
                  <Link
                    href={`/admin/shepherd-care/over-shepherds/${os.id}`}
                    style={{
                      color: P.ink,
                      fontWeight: 600,
                      textDecoration: "none",
                    }}
                  >
                    {os.full_name}
                  </Link>
                </td>
                <td style={tdStyle}>
                  {os.email ?? <span style={{ color: P.ink3 }}>—</span>}
                </td>
                <td style={tdStyle}>
                  {os.phone ?? <span style={{ color: P.ink3 }}>—</span>}
                </td>
                <td style={tdStyle}>
                  {os.active ? (
                    <span style={{ color: P.ink }}>Active</span>
                  ) : (
                    <span style={{ color: P.ink3 }}>Archived</span>
                  )}
                </td>
                <td style={tdStyle}>{count}</td>
                <td style={tdStyle}>
                  <OverShepherdArchiveButton
                    overShepherdId={os.id}
                    fullName={os.full_name}
                    active={os.active}
                    coveredCount={count}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
