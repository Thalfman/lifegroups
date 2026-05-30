import Link from "next/link";
import { StatusCard, EmptyState } from "@/components/dashboard/cards";
import { PBadge, type PTone } from "@/components/pastoral/atoms";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";
import { attentionReasonLabel } from "@/lib/dashboard/admin-group-model";
import type {
  AttentionItem,
  AttentionReason,
} from "@/lib/dashboard/types";
import { meetingLine } from "./shared";

const VISIBLE_LIMIT = 6;

function toneFor(reason: AttentionReason): PTone {
  switch (reason) {
    case "follow_up_open":
    case "health_needs_follow_up":
    case "capacity_full":
    case "missing_check_in":
      return "followup";
    case "capacity_warning":
    case "health_watch":
      return "watch";
    case "capacity_unknown":
    case "no_leader":
    case "no_members":
    case "missing_meeting_day_time":
      return "neutral";
  }
}

function ReasonBadges({
  primary,
  secondary,
}: {
  primary: AttentionReason;
  secondary: AttentionReason[];
}) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      <PBadge tone={toneFor(primary)}>{attentionReasonLabel(primary)}</PBadge>
      {secondary.map((reason) => (
        <PBadge key={reason} tone={toneFor(reason)} outline>
          {attentionReasonLabel(reason)}
        </PBadge>
      ))}
    </div>
  );
}

export function AttentionList({
  items,
  meetingWeek,
}: {
  items: AttentionItem[];
  meetingWeek: string;
}) {
  const visible = items.slice(0, VISIBLE_LIMIT);
  const overflow = Math.max(0, items.length - visible.length);

  return (
    <StatusCard
      title="Groups needing attention"
      eyebrow="Action queue"
      action={
        items.length > 0
          ? `${items.length} ${items.length === 1 ? "group" : "groups"}`
          : null
      }
    >
      {visible.length === 0 ? (
        <EmptyState
          title="Quiet stretch"
          description="No groups are flagged for follow-up this week. Check back after leaders submit their next check-ins."
        />
      ) : (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "grid",
            gap: 12,
          }}
        >
          {visible.map((item) => {
            const meta = meetingLine(item.meetingDay, item.meetingTime);
            const capacityLabel =
              item.effectiveCapacity != null
                ? `${item.activeMemberCount} / ${item.effectiveCapacity} members`
                : `${item.activeMemberCount} members · capacity unknown`;
            return (
              <li
                key={item.groupId}
                style={{
                  background: P.surface,
                  border: `1px solid ${P.line}`,
                  borderRadius: 12,
                  padding: "14px 16px",
                  display: "grid",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: fontDisplay,
                        fontSize: 17,
                        fontWeight: 600,
                        color: P.ink,
                      }}
                    >
                      {item.groupName}
                    </div>
                    {item.leaderNames.length > 0 ? (
                      <div
                        style={{
                          fontFamily: fontBody,
                          fontSize: 13,
                          color: P.ink2,
                        }}
                      >
                        {item.leaderNames.join(" · ")}
                      </div>
                    ) : (
                      <div
                        style={{
                          fontFamily: fontBody,
                          fontSize: 13,
                          color: P.ink3,
                          fontStyle: "italic",
                        }}
                      >
                        No leaders assigned
                      </div>
                    )}
                  </div>
                  <ReasonBadges
                    primary={item.reason}
                    secondary={item.secondaryReasons}
                  />
                </div>

                <div
                  style={{
                    fontFamily: fontBody,
                    fontSize: 13,
                    color: P.ink2,
                  }}
                >
                  {item.detail}
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                    fontFamily: fontBody,
                    fontSize: 12.5,
                    color: P.ink3,
                  }}
                >
                  <span>{capacityLabel}</span>
                  {meta ? <span>· {meta}</span> : null}
                  {item.excludedFromCapacity ? (
                    <span>· Excluded from capacity</span>
                  ) : null}
                  {item.dueLabel ? (
                    <span
                      style={{
                        color: item.isOverdue ? "#7d3621" : P.ink3,
                      }}
                    >
                      ·{" "}
                      {item.isOverdue
                        ? `Overdue (was due ${item.dueLabel})`
                        : `Check-in due ${item.dueLabel}`}
                      {item.dueRelative ? ` · ${item.dueRelative}` : ""}
                    </span>
                  ) : null}
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                    fontFamily: fontSans,
                    fontSize: 11.5,
                    fontWeight: 600,
                    letterSpacing: 0.4,
                    textTransform: "uppercase",
                  }}
                >
                  <Link
                    href={`/admin/check-ins/${item.groupId}?week=${meetingWeek}`}
                    style={{
                      color: P.ink,
                      textDecoration: "none",
                      borderBottom: `1px solid ${P.line}`,
                      paddingBottom: 1,
                    }}
                  >
                    View check-in →
                  </Link>
                  <Link
                    href="/admin/groups"
                    style={{
                      color: P.ink2,
                      textDecoration: "none",
                      borderBottom: `1px solid ${P.line}`,
                      paddingBottom: 1,
                    }}
                  >
                    Open group setup
                  </Link>
                  {(item.reason === "capacity_full" ||
                    item.reason === "capacity_warning" ||
                    item.reason === "capacity_unknown" ||
                    item.secondaryReasons.includes("capacity_full") ||
                    item.secondaryReasons.includes("capacity_warning") ||
                    item.secondaryReasons.includes("capacity_unknown")) ? (
                    <Link
                      href="/admin/settings"
                      style={{
                        color: P.ink2,
                        textDecoration: "none",
                        borderBottom: `1px solid ${P.line}`,
                        paddingBottom: 1,
                      }}
                    >
                      Adjust thresholds
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
          {overflow > 0 ? (
            <li
              style={{
                fontFamily: fontBody,
                fontSize: 12.5,
                color: P.ink3,
                textAlign: "center",
                fontStyle: "italic",
                paddingTop: 4,
              }}
            >
              +{overflow} more {overflow === 1 ? "group" : "groups"} —{" "}
              <Link
                href="/admin/groups"
                style={{
                  color: P.ink2,
                  textDecoration: "underline",
                  fontStyle: "normal",
                }}
              >
                see all in Groups
              </Link>
              {" · "}
              <Link
                href={`/admin/check-ins?week=${meetingWeek}`}
                style={{
                  color: P.ink2,
                  textDecoration: "underline",
                  fontStyle: "normal",
                }}
              >
                review check-ins
              </Link>
            </li>
          ) : null}
        </ul>
      )}
    </StatusCard>
  );
}
