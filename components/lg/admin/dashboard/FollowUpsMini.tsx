import Link from "next/link";
import { Pill, type PillTone } from "@/components/lg/Pill";
import type { FollowUpItem } from "@/lib/dashboard/types";

function priorityTone(priority: FollowUpItem["priority"]): PillTone {
  if (priority === "high") return "rose";
  if (priority === "normal") return "amber";
  return "neutral";
}

function priorityLabel(priority: FollowUpItem["priority"]): string {
  if (priority === "high") return "high";
  if (priority === "normal") return "normal";
  return "low";
}

function formatDue(dueDate: string | null): string {
  if (!dueDate) return "anytime";
  // Be defensive — show YYYY-MM-DD or a friendlier short form when valid.
  const d = new Date(`${dueDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dueDate;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function FollowUpsMini({ items }: { items: FollowUpItem[] }) {
  const open = items.slice(0, 3);

  if (open.length === 0) {
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <p
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 13,
            color: "var(--c-ink3)",
            fontStyle: "italic",
            margin: 0,
          }}
        >
          No open follow-ups yet.
        </p>
        <Link
          href="/admin/follow-ups"
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 12,
            color: "var(--c-sageDeep)",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Open follow-ups →
        </Link>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {open.map((f) => (
        <Link
          key={f.id}
          href="/admin/follow-ups"
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            background: "var(--c-surfaceAlt)",
            display: "grid",
            gap: 4,
            textDecoration: "none",
            color: "inherit",
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
            Due {formatDue(f.dueDate)}
            {f.relatedGroupName ? ` · ${f.relatedGroupName}` : ""}
          </div>
        </Link>
      ))}
      <Link
        href="/admin/follow-ups"
        style={{
          marginTop: 2,
          fontFamily: "var(--font-body)",
          fontSize: 12,
          color: "var(--c-sageDeep)",
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        See all follow-ups →
      </Link>
    </div>
  );
}
