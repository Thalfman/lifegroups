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
}: {
  items: CareRecentInteraction[];
}) {
  return (
    <StatusCard
      eyebrow="Activity"
      title="Recent interactions"
    >
      {items.length === 0 ? (
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
