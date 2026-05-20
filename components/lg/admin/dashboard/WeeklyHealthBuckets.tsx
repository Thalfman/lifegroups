import Link from "next/link";
import type { HealthSummary } from "@/lib/dashboard/types";

interface Bucket {
  label: string;
  count: number;
  href: string;
}

export function WeeklyHealthBuckets({
  summary,
  meetingWeek,
}: {
  summary: HealthSummary;
  meetingWeek: string;
}) {
  const buckets: Bucket[] = [
    {
      label: "Submitted",
      count: summary.counts.submitted,
      href: `/admin/check-ins?week=${meetingWeek}`,
    },
    {
      label: "Missing",
      count: summary.counts.missing,
      href: `/admin/check-ins?week=${meetingWeek}`,
    },
    {
      label: "Did not meet",
      count: summary.counts.did_not_meet,
      href: `/admin/check-ins?week=${meetingWeek}`,
    },
    {
      label: "Planned pause",
      count: summary.counts.planned_pause,
      href: `/admin/check-ins?week=${meetingWeek}`,
    },
    {
      label: "Needs follow-up",
      count: summary.counts.needs_follow_up,
      href: `/admin/check-ins?week=${meetingWeek}`,
    },
    {
      label: "Watch",
      count: summary.counts.watch,
      href: `/admin/check-ins?week=${meetingWeek}`,
    },
    {
      label: "Healthy",
      count: summary.counts.healthy,
      href: `/admin/check-ins?week=${meetingWeek}`,
    },
  ];

  return (
    <div
      className="lg-shell-grid-7"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
        gap: 10,
      }}
    >
      {buckets.map((b) => (
        <Link
          key={b.label}
          href={b.href}
          style={{
            background: "var(--c-surfaceAlt)",
            border: "1px solid var(--c-line)",
            borderRadius: 10,
            padding: "14px 12px",
            textAlign: "left",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            textDecoration: "none",
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
            {b.count}
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
