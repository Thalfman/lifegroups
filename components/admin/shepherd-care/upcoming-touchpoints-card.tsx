import Link from "next/link";
import type { CSSProperties } from "react";
import { StatusCard, EmptyState } from "@/components/dashboard/cards";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import type { CareUpcomingTouchpoint } from "@/lib/admin/shepherd-care-dashboard";

const ROW_LINK: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  gap: 12,
  padding: "10px 0",
  borderBottom: `1px solid ${P.line2}`,
  textDecoration: "none",
  color: "inherit",
};

export function UpcomingTouchpointsCard({
  items,
}: {
  items: CareUpcomingTouchpoint[];
}) {
  return (
    <StatusCard eyebrow="This week" title="Upcoming touchpoints">
      {items.length === 0 ? (
        <EmptyState
          title="No touchpoints due"
          description="Nothing on the calendar for the next 7 days. Schedule a next touchpoint from any leader detail page."
        />
      ) : (
        <div>
          {items.map((item) => {
            const overdue = item.daysFromToday < 0;
            return (
              <Link
                key={item.shepherdProfileId}
                href={item.href}
                style={ROW_LINK}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontFamily: fontSans,
                      fontSize: 14,
                      fontWeight: 600,
                      color: P.ink,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {item.shepherdName}
                  </div>
                  <div
                    style={{
                      fontFamily: fontBody,
                      fontSize: 12,
                      color: P.ink3,
                      marginTop: 2,
                    }}
                  >
                    Due {item.dueOn}
                  </div>
                </div>
                <div
                  style={{
                    fontFamily: fontSans,
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: 0.4,
                    textTransform: "uppercase",
                    color: overdue ? "#923220" : P.ink2,
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.relativeLabel}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </StatusCard>
  );
}
