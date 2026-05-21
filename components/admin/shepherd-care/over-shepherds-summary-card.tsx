import Link from "next/link";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import type { OverShepherdListRow } from "@/lib/supabase/read-models";

const cardStyle = {
  background: P.surface,
  border: `1px solid ${P.line}`,
  borderRadius: 12,
  padding: 18,
};

const headerStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  marginBottom: 12,
  flexWrap: "wrap" as const,
};

const titleStyle = {
  fontFamily: fontSans,
  fontSize: 14,
  letterSpacing: 0.6,
  margin: 0,
  color: P.ink,
};

const manageLinkStyle = {
  fontFamily: fontBody,
  fontSize: 12,
  color: P.ink2,
  textDecoration: "underline",
};

const tileStyle = {
  background: P.bgDeep,
  border: `1px solid ${P.line2}`,
  borderRadius: 8,
  padding: "10px 12px",
  display: "grid",
  gap: 4,
};

export function OverShepherdsSummaryCard({
  overShepherds,
  shepherdCountById,
  unassignedCount,
}: {
  overShepherds: OverShepherdListRow[];
  shepherdCountById: Map<string, number>;
  unassignedCount: number;
}) {
  const activeOverShepherds = overShepherds.filter((os) => os.active);
  return (
    <section style={cardStyle} aria-label="Over-shepherds">
      <div style={headerStyle}>
        <h2 style={titleStyle}>Over-shepherds</h2>
        <Link
          href="/admin/shepherd-care/over-shepherds"
          style={manageLinkStyle}
        >
          Manage over-shepherds →
        </Link>
      </div>
      {activeOverShepherds.length === 0 ? (
        <p
          style={{
            fontFamily: fontBody,
            fontSize: 13,
            color: P.ink2,
            margin: 0,
          }}
        >
          No over-shepherds yet. Add a coach to start tracking coverage.
        </p>
      ) : (
        <div
          className="lg-m-grid-stack"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 10,
          }}
        >
          {activeOverShepherds.map((os) => (
            <Link
              key={os.id}
              href={`/admin/shepherd-care/over-shepherds/${os.id}`}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div style={tileStyle}>
                <div
                  style={{
                    fontFamily: fontSans,
                    fontSize: 13,
                    color: P.ink,
                    fontWeight: 600,
                  }}
                >
                  {os.full_name}
                </div>
                <div
                  style={{ fontFamily: fontBody, fontSize: 12, color: P.ink3 }}
                >
                  {(shepherdCountById.get(os.id) ?? 0)} shepherd
                  {(shepherdCountById.get(os.id) ?? 0) === 1 ? "" : "s"}
                </div>
              </div>
            </Link>
          ))}
          <div style={tileStyle}>
            <div
              style={{
                fontFamily: fontSans,
                fontSize: 13,
                color: P.ink,
                fontWeight: 600,
              }}
            >
              Unassigned
            </div>
            <div
              style={{ fontFamily: fontBody, fontSize: 12, color: P.ink3 }}
            >
              {unassignedCount} shepherd
              {unassignedCount === 1 ? "" : "s"}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
