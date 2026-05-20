import Link from "next/link";
import type { HealthSummary, HealthBucket } from "@/lib/dashboard/types";

type BucketDef = {
  key: HealthBucket;
  label: string;
  tone: "sage" | "rose" | "neutral" | "blue" | "amber";
};

const BUCKETS: BucketDef[] = [
  { key: "submitted", label: "Submitted", tone: "sage" },
  { key: "missing", label: "Missing", tone: "rose" },
  { key: "did_not_meet", label: "Did not meet", tone: "neutral" },
  { key: "planned_pause", label: "Planned pause", tone: "blue" },
  { key: "needs_follow_up", label: "Needs follow-up", tone: "rose" },
  { key: "watch", label: "Watch", tone: "amber" },
  { key: "healthy", label: "Healthy", tone: "sage" },
];

export function HealthBuckets({
  summary,
  meetingWeek,
}: {
  summary: HealthSummary;
  meetingWeek: string;
}) {
  return (
    <div
      className="lg-m-health-grid"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
        gap: 10,
      }}
    >
      {BUCKETS.map((b) => (
        <Link
          key={b.key}
          href={`/admin/check-ins?week=${meetingWeek}`}
          style={{
            background: "var(--c-surfaceAlt)",
            border: "1px solid var(--c-line)",
            borderRadius: 10,
            padding: "14px 12px",
            textAlign: "left",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            textDecoration: "none",
            color: "inherit",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 28,
              fontWeight: 400,
              color: "var(--c-ink)",
              letterSpacing: -0.5,
              lineHeight: 1,
            }}
          >
            {summary.counts[b.key]}
          </span>
          <span
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 11,
              color: "var(--c-ink2)",
              fontWeight: 500,
            }}
          >
            {b.label}
          </span>
        </Link>
      ))}
    </div>
  );
}
