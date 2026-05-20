import Link from "next/link";
import { Pill, type PillTone } from "@/components/pastoral/primitives";
import type { FollowUpItem } from "@/lib/dashboard/types";

function priorityTone(priority: FollowUpItem["priority"]): PillTone {
  if (priority === "high") return "rose";
  if (priority === "normal") return "amber";
  return "neutral";
}

function priorityLabel(priority: FollowUpItem["priority"]): string {
  if (priority === "high") return "High";
  if (priority === "normal") return "Normal";
  return "Low";
}

export function FollowUpsMini({ items }: { items: FollowUpItem[] }) {
  const open = items.slice(0, 3);
  if (open.length === 0) {
    return (
      <div
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 12.5,
          color: "var(--c-ink3)",
          padding: "8px 4px",
          fontStyle: "italic",
        }}
      >
        Nothing pending — open follow-ups appear here as they&apos;re created.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {open.map((f) => (
        <div
          key={f.id}
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            background: "var(--c-surfaceAlt)",
            display: "grid",
            gap: 4,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--c-ink)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                minWidth: 0,
              }}
            >
              {f.title}
            </span>
            <Pill tone={priorityTone(f.priority)}>{priorityLabel(f.priority)}</Pill>
          </div>
          <div
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 11.5,
              color: "var(--c-ink3)",
            }}
          >
            {f.dueDate ? `Due ${f.dueDate}` : "No due date"}
            {f.relatedGroupName ? ` · ${f.relatedGroupName}` : ""}
          </div>
        </div>
      ))}
      <Link
        href="/admin/follow-ups"
        style={{
          marginTop: 2,
          background: "transparent",
          border: "none",
          fontFamily: "var(--font-body)",
          fontSize: 12,
          color: "var(--c-sage)",
          textDecoration: "none",
          padding: "4px 0",
          fontWeight: 600,
        }}
      >
        See all follow-ups →
      </Link>
    </div>
  );
}
