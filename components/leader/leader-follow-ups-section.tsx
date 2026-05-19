"use client";

import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";
import { PBadge } from "@/components/pastoral/atoms";
import { EmptyState, StatusCard } from "@/components/dashboard/cards";
import {
  followUpPriorityLabel,
  followUpTypeLabel,
} from "@/lib/dashboard/labels";
import { LeaderFollowUpStatusButton } from "./leader-follow-up-status-button";
import type {
  FollowUpPriority,
  FollowUpStatus,
} from "@/types/enums";

/**
 * Leader-facing follow-up view model. Privacy boundary: this type
 * intentionally exposes only `leaderVisibleNote` and has **no**
 * `adminPrivateNote` / `admin_private_note` field. The mapping from
 * `LeaderFollowUpRow` to this shape in `app/(protected)/leader/page.tsx`
 * never reads `admin_private_note`, and the upstream reader
 * (`fetchFollowUpsForLeader`) does not select the column. Keep this type
 * narrow — see `docs/PHASE_5C_1_PRIVACY_HARDENING.md`.
 */
export type LeaderFollowUpItem = {
  id: string;
  title: string;
  type: import("@/types/enums").FollowUpType;
  priority: FollowUpPriority;
  status: FollowUpStatus;
  dueDate: string | null;
  relatedGroupId: string | null;
  relatedGroupName: string | null;
  relatedGuestId: string | null;
  relatedGuestName: string | null;
  leaderVisibleNote: string | null;
};

const STATUS_LABEL: Record<FollowUpStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
  snoozed: "Snoozed",
};

export function LeaderFollowUpsSection({
  items,
}: {
  items: LeaderFollowUpItem[];
}) {
  const active = items.filter((i) => i.status === "open" || i.status === "in_progress");
  const recentlyDone = items.filter((i) => i.status === "done").slice(0, 4);

  return (
    <StatusCard title="Follow-ups" eyebrow="Threads to close out">
      {active.length === 0 ? (
        <EmptyState
          title="No follow-ups right now"
          description="When an admin assigns a follow-up to you or to a group you lead, it'll show up here."
        />
      ) : (
        <ul style={listResetStyle}>
          {active.map((item, i, arr) => (
            <li
              key={item.id}
              style={{
                padding: "14px 0",
                borderBottom: i < arr.length - 1 ? `1px solid ${P.line2}` : "none",
              }}
            >
              <LeaderFollowUpRow item={item} />
            </li>
          ))}
        </ul>
      )}
      {recentlyDone.length > 0 ? (
        <details style={{ marginTop: 14 }}>
          <summary
            style={{
              fontFamily: fontSans,
              fontSize: 11,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              color: P.ink3,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Recently closed ({recentlyDone.length})
          </summary>
          <ul style={{ ...listResetStyle, marginTop: 10 }}>
            {recentlyDone.map((item, i, arr) => (
              <li
                key={item.id}
                style={{
                  padding: "10px 0",
                  borderBottom: i < arr.length - 1 ? `1px solid ${P.line2}` : "none",
                }}
              >
                <div
                  style={{
                    fontFamily: fontBody,
                    fontSize: 13,
                    color: P.ink2,
                    fontStyle: "italic",
                  }}
                >
                  {item.title}
                </div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </StatusCard>
  );
}

function LeaderFollowUpRow({ item }: { item: LeaderFollowUpItem }) {
  const guestLabel = item.relatedGuestId
    ? item.relatedGuestName ?? "Guest"
    : null;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: fontDisplay,
              fontSize: 16,
              fontWeight: 500,
              color: P.ink,
              letterSpacing: -0.2,
            }}
          >
            {item.title}
          </div>
          <div
            style={{
              fontFamily: fontSans,
              fontSize: 11,
              color: P.ink3,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              marginTop: 4,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span>{followUpTypeLabel(item.type)}</span>
            <span>· {STATUS_LABEL[item.status]}</span>
            {item.dueDate ? <span>· Due {item.dueDate}</span> : null}
          </div>
          {(item.relatedGroupName || guestLabel) && (
            <div
              style={{
                fontFamily: fontBody,
                fontSize: 13,
                color: P.ink2,
                marginTop: 4,
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              {item.relatedGroupName ? <span>Group: {item.relatedGroupName}</span> : null}
              {guestLabel ? <span>Guest: {guestLabel}</span> : null}
            </div>
          )}
        </div>
        <PBadge tone={priorityTone(item.priority)}>
          {followUpPriorityLabel(item.priority)}
        </PBadge>
      </div>
      {item.leaderVisibleNote ? (
        <blockquote
          style={{
            background: P.bg,
            borderLeft: `3px solid ${P.sage}`,
            borderRadius: 10,
            padding: "10px 14px",
            margin: 0,
            fontFamily: fontBody,
            fontSize: 13,
            fontStyle: "italic",
            color: P.ink,
            lineHeight: 1.5,
          }}
        >
          {item.leaderVisibleNote}
        </blockquote>
      ) : null}
      <LeaderFollowUpStatusButton followUpId={item.id} status={item.status} />
    </div>
  );
}

function priorityTone(priority: FollowUpPriority) {
  if (priority === "high") return "followup" as const;
  if (priority === "normal") return "watch" as const;
  return "neutral" as const;
}

const listResetStyle = { listStyle: "none", padding: 0, margin: 0 } as const;
