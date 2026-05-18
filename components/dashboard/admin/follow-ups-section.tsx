import { StatusCard, EmptyState } from "@/components/dashboard/cards";
import { PBadge } from "@/components/pastoral/atoms";
import { P, fontBody } from "@/lib/pastoral";
import {
  followUpPriorityLabel,
  followUpTypeLabel,
} from "@/lib/dashboard/labels";
import type { FollowUpItem } from "@/lib/dashboard/types";

function priorityToTone(priority: string) {
  if (priority === "high") return "followup" as const;
  if (priority === "normal") return "watch" as const;
  return "neutral" as const;
}

export function FollowUpsSection({ items }: { items: FollowUpItem[] }) {
  return (
    <StatusCard title="Open follow-ups" eyebrow="Stewardship queue">
      {items.length === 0 ? (
        <EmptyState
          title="Nothing pending"
          description="Open follow-ups will surface here."
        />
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {items.slice(0, 5).map((item, idx, arr) => (
            <li
              key={item.id}
              style={{
                padding: "12px 0",
                borderBottom:
                  idx < arr.length - 1 ? `1px solid ${P.line2}` : "none",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "flex-start",
                  marginBottom: 4,
                }}
              >
                <span
                  style={{
                    fontFamily: fontBody,
                    fontSize: 14,
                    fontWeight: 500,
                    color: P.ink,
                  }}
                >
                  {item.title}
                </span>
                <PBadge tone={priorityToTone(item.priority)}>
                  {followUpPriorityLabel(item.priority)}
                </PBadge>
              </div>
              <div
                style={{
                  fontFamily: fontBody,
                  fontSize: 12,
                  color: P.ink2,
                  fontStyle: "italic",
                }}
              >
                {followUpTypeLabel(item.type)}
                {item.relatedGroupName ? ` · ${item.relatedGroupName}` : ""}
                {item.dueDate ? ` · Due ${item.dueDate}` : ""}
              </div>
            </li>
          ))}
        </ul>
      )}
    </StatusCard>
  );
}
