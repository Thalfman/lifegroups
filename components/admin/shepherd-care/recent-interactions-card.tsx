import Link from "next/link";
import type { CSSProperties } from "react";
import { StatusCard, EmptyState } from "@/components/dashboard/cards";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import { shepherdCareInteractionTypeLabel } from "@/lib/dashboard/labels";
import type { CareRecentInteraction } from "@/lib/admin/shepherd-care-dashboard";

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

const TYPE_BADGE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "2px 8px",
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  fontFamily: fontSans,
  background: P.sageSoft,
  color: "#3e4f29",
  border: `1px solid ${P.line}`,
};

export function RecentInteractionsCard({
  items,
  available = true,
}: {
  items: CareRecentInteraction[];
  // False when the recent-interactions read failed. The card renders an
  // explicit "temporarily unavailable" state instead of the zero-data
  // empty state so admins don't read a transient DB error as "nothing
  // has been logged."
  available?: boolean;
}) {
  return (
    <StatusCard
      eyebrow="Activity"
      title="Recent interactions"
    >
      {!available ? (
        <EmptyState
          title="Recent interactions unavailable"
          description="We couldn't load the latest interactions just now. Refresh in a moment, or check a specific shepherd's detail page for their full timeline."
        />
      ) : items.length === 0 ? (
        <EmptyState
          title="No interactions logged yet"
          description="Log a call, text, or visit from any shepherd detail page to start the trail."
        />
      ) : (
        <div>
          {items.map((item) => (
            <Link key={item.id} href={item.href} style={ROW_LINK}>
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
                  {item.interactionAt} · logged {item.createdAt.slice(0, 10)}
                </div>
              </div>
              <span style={TYPE_BADGE}>
                {shepherdCareInteractionTypeLabel(item.interactionType)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </StatusCard>
  );
}
