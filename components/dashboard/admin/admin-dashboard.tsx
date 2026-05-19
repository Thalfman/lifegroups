import Link from "next/link";
import { SectionHeader } from "@/components/layout/shell";
import { WeekSelector } from "@/components/admin/week-selector";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";
import type { AdminDashboardData } from "@/lib/dashboard/types";
import type { WeekOption } from "@/lib/admin/check-ins";
import { SummaryCards } from "./summary-cards";
import { AttentionList } from "./attention-list";

// Phase 5A.5: this is the high-level command center. The detailed
// per-group lists live on /admin/groups, /admin/check-ins,
// /admin/guests, /admin/follow-ups, and /admin/settings -- the
// dashboard summarizes and routes, it doesn't try to be each of
// those pages too.

export function AdminDashboard({
  data,
  weekOptions,
}: {
  data: AdminDashboardData;
  weekOptions: WeekOption[];
}) {
  const capacity = data.capacitySummary.counts;
  const health = data.healthSummary.counts;
  const setup = data.setupGaps.counts;
  const totalSetupGaps =
    setup.noCapacity + setup.noLeader + setup.noMeetingDayTime + setup.noMembers;

  return (
    <div style={{ display: "grid", gap: 22 }}>
      <SummaryCards summary={data.summary} />

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, auto) 1fr",
          gap: 14,
          alignItems: "center",
        }}
      >
        <SectionHeader
          eyebrow={data.isCurrentWeek ? "This week" : "Showing"}
          title={data.weekLabel}
          description="Switch the meeting week to revisit prior check-ins. Closed groups stay out of these totals."
        />
        <div style={{ justifySelf: "end" }}>
          <WeekSelector
            meetingWeek={data.meetingWeek}
            weekOptions={weekOptions}
            formAction="/admin"
            selectId="admin-week-select"
          />
        </div>
      </section>

      <AttentionList
        items={data.attentionItems}
        meetingWeek={data.meetingWeek}
      />

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 14,
        }}
      >
        <DrillDownCard
          eyebrow="Capacity"
          title="At a glance"
          rows={[
            { label: "Full", value: capacity.full, tone: capacity.full > 0 ? "warn" : undefined },
            { label: "Near capacity", value: capacity.warning, tone: capacity.warning > 0 ? "watch" : undefined },
            { label: "OK", value: capacity.ok },
            { label: "Unknown", value: capacity.unknown },
          ]}
          href="/admin/groups"
          cta="View all groups"
        />
        <DrillDownCard
          eyebrow="Health"
          title="This week's pulse"
          rows={[
            { label: "Submitted", value: health.submitted },
            { label: "Missing", value: health.missing, tone: health.missing > 0 ? "warn" : undefined },
            { label: "Did not meet", value: health.did_not_meet },
            { label: "Needs follow-up", value: health.needs_follow_up, tone: health.needs_follow_up > 0 ? "warn" : undefined },
          ]}
          // Carry the selected week into the drill-down so a historical
          // review on /admin keeps showing the same week's data when the
          // admin clicks through.
          href={`/admin/check-ins?week=${data.meetingWeek}`}
          cta="Review check-ins"
        />
        <DrillDownCard
          eyebrow="Setup gaps"
          title={totalSetupGaps === 0 ? "Everything is configured" : "Setup work waiting"}
          rows={[
            { label: "No capacity", value: setup.noCapacity },
            { label: "No leader", value: setup.noLeader },
            { label: "Missing day/time", value: setup.noMeetingDayTime },
            { label: "No active members", value: setup.noMembers },
          ]}
          href="/admin/groups"
          cta="Open group setup"
        />
        <DrillDownCard
          eyebrow="Guests"
          title={`${data.guestPipelineCount} in flight`}
          rows={data.guestPipelineBreakdown.slice(0, 4).map((row) => ({
            label: row.label,
            value: row.count,
          }))}
          href="/admin/guests"
          cta="Manage guests"
        />
        <DrillDownCard
          eyebrow="Follow-ups"
          title={data.followUps.length === 0 ? "Nothing pending" : "Open threads"}
          rows={data.followUps.slice(0, 3).map((item) => ({
            label: item.title,
            value:
              item.priority === "high"
                ? "High"
                : item.priority === "normal"
                  ? "Normal"
                  : "Low",
            tone: item.priority === "high" ? "warn" : undefined,
            small: true,
          }))}
          emptyHint={
            data.followUps.length === 0
              ? "Open follow-ups appear here as they're created."
              : undefined
          }
          href="/admin/follow-ups"
          cta="Open follow-ups"
        />
        <DrillDownCard
          eyebrow="Settings"
          title="Thresholds & defaults"
          rows={[
            { label: "Adjust capacity / health thresholds" },
            { label: "Tune check-in due offset" },
            { label: "Per-group overrides" },
          ]}
          href="/admin/settings"
          cta="Adjust settings"
        />
      </section>

      <p
        style={{
          fontFamily: fontBody,
          fontSize: 12,
          color: P.ink3,
          margin: 0,
          fontStyle: "italic",
        }}
      >
        Capacity thresholds, the check-in due offset, and per-group
        overrides are configured in{" "}
        <Link href="/admin/settings" style={{ color: P.ink2 }}>
          /admin/settings
        </Link>
        . Closed groups never appear in the buckets above.
      </p>
    </div>
  );
}

type DrillRow = {
  label: string;
  value?: number | string;
  tone?: "warn" | "watch";
  small?: boolean;
};

// Concise summary card with a few key rows and a single CTA into a
// detail page. The intent is "what's the headline + click here to dig
// in" -- so each row is at most one short label + one short value.
function DrillDownCard({
  eyebrow,
  title,
  rows,
  href,
  cta,
  emptyHint,
}: {
  eyebrow: string;
  title: string;
  rows: DrillRow[];
  href: string;
  cta: string;
  emptyHint?: string;
}) {
  const nonEmpty = rows.filter((r) => r.label !== "" || r.value !== undefined);
  return (
    <div
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 14,
        padding: "18px 20px",
        display: "grid",
        gap: 12,
      }}
    >
      <div>
        <div
          style={{
            fontFamily: fontSans,
            fontSize: 10,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            color: P.ink3,
            fontWeight: 600,
          }}
        >
          {eyebrow}
        </div>
        <div
          style={{
            fontFamily: fontDisplay,
            fontSize: 17,
            fontWeight: 600,
            letterSpacing: -0.2,
            color: P.ink,
            marginTop: 4,
          }}
        >
          {title}
        </div>
      </div>
      {emptyHint && nonEmpty.length === 0 ? (
        <p
          style={{
            fontFamily: fontBody,
            fontSize: 12.5,
            color: P.ink3,
            margin: 0,
            fontStyle: "italic",
          }}
        >
          {emptyHint}
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {nonEmpty.map((row, idx) => {
            const valueColor =
              row.tone === "warn"
                ? P.terra
                : row.tone === "watch"
                  ? "#7a5118"
                  : P.ink;
            return (
              <li
                key={`${row.label}-${idx}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 10,
                  padding: row.small ? "6px 0" : "8px 0",
                  borderBottom:
                    idx < nonEmpty.length - 1 ? `1px solid ${P.line2}` : "none",
                }}
              >
                <span
                  style={{
                    fontFamily: fontBody,
                    fontSize: row.small ? 13 : 13.5,
                    color: P.ink2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {row.label}
                </span>
                {row.value !== undefined ? (
                  <span
                    style={{
                      fontFamily: fontBody,
                      fontSize: row.small ? 12 : 13.5,
                      color: valueColor,
                      fontWeight: row.tone ? 600 : 500,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.value}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <Link
        href={href}
        style={{
          fontFamily: fontSans,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          color: P.terra,
          textDecoration: "none",
          alignSelf: "start",
        }}
      >
        {cta} &rarr;
      </Link>
    </div>
  );
}
