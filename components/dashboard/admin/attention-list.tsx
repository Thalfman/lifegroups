import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Pill, type PillTone } from "@/components/pastoral/primitives";
import { attentionReasonLabel } from "@/lib/dashboard/queries";
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

function shortReason(reason: AttentionReason): string {
  switch (reason) {
    case "follow_up_open":
    case "health_needs_follow_up":
      return "Care";
    case "missing_check_in":
      return "Missing";
    case "capacity_full":
      return "Full";
    case "capacity_warning":
      return "Warning";
    case "health_watch":
      return "Watch";
    case "capacity_unknown":
      return "Capacity";
    case "no_leader":
      return "No leader";
    case "no_members":
      return "Setup";
    case "missing_meeting_day_time":
      return "Setup";
  }
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

  if (visible.length === 0) {
    return (
      <div
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 13,
          color: "var(--c-ink3)",
          padding: "20px 4px",
          fontStyle: "italic",
        }}
      >
        Quiet stretch. No groups are flagged for follow-up this week — check
        back after leaders submit their next check-ins.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {visible.map((item, idx) => {
        const tone = toneFor(item.reason);
        const reasonLabel = shortReason(item.reason);
        const detail = secondaryDetail(item);
        const last = idx === visible.length - 1;
        return (
          <Link
            key={item.groupId}
            href={`/admin/check-ins/${item.groupId}?week=${meetingWeek}`}
            style={{
              display: "grid",
              gridTemplateColumns: "96px 1fr auto",
              alignItems: "center",
              gap: 16,
              padding: "12px 0",
              borderBottom: last ? "none" : "1px solid var(--c-lineSoft)",
              textDecoration: "none",
              color: "inherit",
            }}
            title={attentionReasonLabel(item.reason)}
          >
            <div>
              <Pill tone={tone}>{reasonLabel}</Pill>
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--c-ink)",
                  marginBottom: 2,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {item.groupName}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 12.5,
                  color: "var(--c-ink2)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {detail}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                color: "var(--c-ink3)",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 11.5,
                }}
              >
                {item.leaderNames.length > 0 ? item.leaderNames.join(" · ") : "—"}
              </span>
              <ChevronRight size={14} aria-hidden="true" strokeWidth={1.6} />
            </div>
          </Link>
        );
      })}
      {overflow > 0 ? (
        <div
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 12.5,
            color: "var(--c-ink3)",
            textAlign: "center",
            fontStyle: "italic",
            padding: "12px 0 0",
          }}
        >
          +{overflow} more {overflow === 1 ? "group" : "groups"} —{" "}
          <Link
            href={`/admin/check-ins?week=${meetingWeek}`}
            style={{ color: "var(--c-ink2)", textDecoration: "underline", fontStyle: "normal" }}
          >
            review check-ins
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function secondaryDetail(item: AttentionItem): string {
  const base = item.detail;
  if (item.dueLabel && item.isOverdue) {
    return `${base} · Overdue (was due ${item.dueLabel})`;
  }
  return base;
}
