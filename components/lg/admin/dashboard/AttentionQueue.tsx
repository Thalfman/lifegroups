import Link from "next/link";
import { Pill, type PillTone } from "@/components/lg/Pill";
import { Icon } from "@/components/lg/Icon";
import { attentionReasonLabel } from "@/lib/dashboard/admin-group-model";
import type { AttentionItem, AttentionReason } from "@/lib/dashboard/types";

const VISIBLE_LIMIT = 6;

function toneFor(reason: AttentionReason): PillTone {
  switch (reason) {
    case "follow_up_open":
    case "health_needs_follow_up":
    case "missing_check_in":
      return "rose";
    case "capacity_full":
      return "clay";
    case "capacity_warning":
    case "health_watch":
      return "amber";
    case "capacity_unknown":
    case "no_leader":
    case "no_members":
    case "missing_meeting_day_time":
      return "neutral";
  }
}

export function AttentionQueue({
  items,
  meetingWeek,
}: {
  items: AttentionItem[];
  meetingWeek: string;
}) {
  const visible = items.slice(0, VISIBLE_LIMIT);
  const overflow = Math.max(0, items.length - visible.length);

  if (visible.length === 0) {
    return (
      <div
        style={{
          padding: "20px 4px",
          color: "var(--c-ink3)",
          fontFamily: "var(--font-body)",
          fontSize: 13.5,
          fontStyle: "italic",
        }}
      >
        Quiet stretch — no groups are flagged this week.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {visible.map((item, idx) => (
        <Link
          key={item.groupId + idx}
          href={`/admin/check-ins/${item.groupId}?week=${meetingWeek}`}
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(90px, auto) 1fr auto",
            alignItems: "center",
            gap: 16,
            padding: "12px 0",
            borderBottom:
              idx < visible.length - 1
                ? "1px solid var(--c-lineSoft)"
                : "none",
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <div>
            <Pill tone={toneFor(item.reason)}>
              {attentionReasonLabel(item.reason)}
            </Pill>
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 14,
                fontWeight: 600,
                color: "var(--c-ink)",
                marginBottom: 2,
              }}
            >
              {item.groupName}
            </div>
            <div
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 12.5,
                color: "var(--c-ink2)",
              }}
            >
              {item.detail}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 11.5,
                color: "var(--c-ink3)",
                maxWidth: 140,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {item.leaderNames.length > 0
                ? item.leaderNames.join(" · ")
                : "—"}
            </span>
            <Icon name="chev" size={13} color="var(--c-ink4)" />
          </div>
        </Link>
      ))}
      {overflow > 0 ? (
        <div
          style={{
            paddingTop: 12,
            fontFamily: "var(--font-body)",
            fontSize: 12.5,
            color: "var(--c-ink3)",
            fontStyle: "italic",
          }}
        >
          +{overflow} more {overflow === 1 ? "group" : "groups"} —{" "}
          <Link
            href={`/admin/check-ins?week=${meetingWeek}`}
            style={{
              color: "var(--c-sageDeep)",
              textDecoration: "underline",
              fontStyle: "normal",
              fontWeight: 600,
            }}
          >
            review all check-ins
          </Link>
        </div>
      ) : null}
    </div>
  );
}
