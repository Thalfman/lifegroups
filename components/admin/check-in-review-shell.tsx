import Link from "next/link";
import { SectionHeader } from "@/components/layout/shell";
import { PBadge, type PTone } from "@/components/pastoral/atoms";
import { WeekSelector } from "@/components/admin/week-selector";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";
import {
  formatSubmittedAt,
  formatWeekLabel,
  lifecycleStatusLabel,
  type GroupReviewRow,
  type LeaderPulseDisplay,
  type SessionReviewStatus,
  type WeekOption,
  type WeeklyReviewData,
} from "@/lib/admin/check-ins";

const listResetStyle = { listStyle: "none", padding: 0, margin: 0 } as const;

function formatMeetingTime(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (!match) return value;
  const hour = Number.parseInt(match[1], 10);
  const minute = match[2];
  const suffix = hour >= 12 ? "p" : "a";
  const display = ((hour + 11) % 12) + 1;
  return `${display}:${minute}${suffix}`;
}

function meetingLine(day: string | null, time: string | null): string | null {
  const t = formatMeetingTime(time);
  const d = day?.trim() ?? null;
  if (d && t) return `${d} · ${t}`;
  if (d) return d;
  if (t) return t;
  return null;
}

function statusBadge(
  status: SessionReviewStatus,
  isScheduledThisWeek: boolean,
) {
  switch (status) {
    case "submitted":
      return <PBadge tone="healthy">Submitted</PBadge>;
    case "admin_entered":
      return (
        <PBadge tone="healthy" outline>
          Submitted · admin
        </PBadge>
      );
    case "missing":
      // Bi-weekly off-parity groups shouldn't be accused of missing a
      // check-in for a week they weren't scheduled to meet. Surface them
      // as "Off-week" instead so admins know nothing is broken.
      if (!isScheduledThisWeek) {
        return (
          <PBadge tone="neutral" outline>
            Off-week
          </PBadge>
        );
      }
      return <PBadge tone="followup">Missing</PBadge>;
    case "did_not_meet":
      return <PBadge tone="neutral">Did not meet</PBadge>;
    case "planned_pause":
      return <PBadge tone="pause">Planned pause</PBadge>;
    default:
      return <PBadge tone="neutral">{status}</PBadge>;
  }
}

const PULSE_LABELS: Record<LeaderPulseDisplay, { label: string; tone: PTone }> = {
  healthy: { label: "Healthy", tone: "healthy" },
  watch: { label: "Watch", tone: "watch" },
  needs_follow_up: { label: "Needs follow-up", tone: "followup" },
};

function pulseBadge(pulse: LeaderPulseDisplay | null) {
  if (!pulse) return null;
  const cfg = PULSE_LABELS[pulse];
  return (
    <PBadge tone={cfg.tone} outline>
      {cfg.label}
    </PBadge>
  );
}

function lifecycleBadge(row: GroupReviewRow) {
  if (row.isActive) return null;
  return (
    <PBadge tone="neutral" outline>
      {lifecycleStatusLabel(row.lifecycleStatus)}
    </PBadge>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "missing" | "followup";
}) {
  const accent =
    tone === "missing" || tone === "followup" ? P.terra : P.ink;
  const labelColor =
    tone === "missing" || tone === "followup" ? P.terra : P.ink3;
  return (
    <div
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 10,
        padding: "14px 16px",
        display: "grid",
        gap: 4,
      }}
    >
      <div
        style={{
          fontFamily: fontDisplay,
          fontSize: 28,
          fontWeight: 500,
          color: accent,
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: fontSans,
          fontSize: 10,
          letterSpacing: 1.6,
          textTransform: "uppercase",
          color: labelColor,
          fontWeight: 600,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      style={{
        background: P.terraSoft,
        border: `1px solid ${P.terra}`,
        borderRadius: 8,
        padding: "12px 14px",
        fontFamily: fontBody,
        fontSize: 13,
        color: "#7d3621",
      }}
    >
      {children}
    </div>
  );
}

function Empty({ title, description }: { title: string; description: string }) {
  return (
    <div
      style={{
        background: P.surface,
        border: `1px dashed ${P.line}`,
        borderRadius: 10,
        padding: "22px 24px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: fontDisplay,
          fontSize: 16,
          color: P.ink,
          fontWeight: 500,
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <p
        style={{
          fontFamily: fontBody,
          fontSize: 13,
          color: P.ink2,
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        {description}
      </p>
    </div>
  );
}

function ReviewCard({
  row,
  meetingWeek,
}: {
  row: GroupReviewRow;
  meetingWeek: string;
}) {
  const meta = meetingLine(row.meetingDay, row.meetingTime);
  const submittedLine =
    row.sessionStatus === "submitted" || row.sessionStatus === "admin_entered"
      ? [row.submittedByName, formatSubmittedAt(row.submittedAt)]
          .filter(Boolean)
          .join(" · ")
      : null;
  const highlight =
    row.sessionStatus === "missing" && row.isActive && row.isScheduledThisWeek
      ? { borderColor: P.terra, background: P.terraSoft }
      : row.followUpNeeded
        ? { borderColor: P.mustard, background: P.surface }
        : { borderColor: P.line, background: P.surface };

  return (
    <article
      style={{
        background: highlight.background,
        border: `1px solid ${highlight.borderColor}`,
        borderRadius: 12,
        padding: "18px 22px",
        display: "grid",
        gap: 12,
      }}
    >
      <header
        className="lg-m-grid-stack"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 12,
          alignItems: "start",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <h3
              style={{
                margin: 0,
                fontFamily: fontDisplay,
                fontSize: 20,
                fontWeight: 500,
                color: P.ink,
                letterSpacing: -0.3,
              }}
            >
              {row.groupName}
            </h3>
            {statusBadge(row.sessionStatus, row.isScheduledThisWeek)}
            {lifecycleBadge(row)}
            {row.followUpNeeded ? (
              <PBadge tone="followup">Follow-up needed</PBadge>
            ) : null}
            {pulseBadge(row.healthPulse)}
          </div>
          {row.leaderNames.length > 0 ? (
            <div
              style={{
                fontFamily: fontBody,
                fontSize: 13,
                color: P.ink2,
                marginTop: 4,
              }}
            >
              {row.leaderNames.join(" · ")}
            </div>
          ) : (
            <div
              style={{
                fontFamily: fontBody,
                fontSize: 13,
                color: P.ink3,
                marginTop: 4,
                fontStyle: "italic",
              }}
            >
              No leaders assigned
            </div>
          )}
          {meta ? (
            <div
              style={{
                fontFamily: fontBody,
                fontSize: 13,
                color: P.ink3,
                marginTop: 2,
              }}
            >
              {meta}
            </div>
          ) : null}
          {row.dueLabel ? (
            <div
              style={{
                fontFamily: fontBody,
                fontSize: 12.5,
                color: row.isOverdue ? "#7d3621" : P.ink3,
                marginTop: 4,
              }}
            >
              {row.isOverdue
                ? `Overdue · was due ${row.dueLabel}`
                : `Check-in due ${row.dueLabel}`}
              {row.dueRelative ? ` · ${row.dueRelative}` : ""}
            </div>
          ) : !row.isScheduledThisWeek && row.isActive ? (
            <div
              style={{
                fontFamily: fontBody,
                fontSize: 12.5,
                color: P.ink3,
                marginTop: 4,
                fontStyle: "italic",
              }}
            >
              Bi-weekly off-parity &mdash; this group wasn&rsquo;t
              scheduled to meet this week.
            </div>
          ) : null}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            alignItems: "flex-end",
          }}
        >
          <Link
            href={`/admin/check-ins/${row.groupId}?week=${meetingWeek}`}
            style={{
              fontFamily: fontSans,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: 0.4,
              padding: "8px 14px",
              background: P.surface,
              color: P.ink,
              border: `1px solid ${P.line}`,
              borderRadius: 8,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            View details →
          </Link>
        </div>
      </header>

      {row.attendance ? (
        <div
          style={{
            fontFamily: fontBody,
            fontSize: 13,
            color: P.ink2,
          }}
        >
          <strong style={{ color: P.ink, fontWeight: 600 }}>
            {row.attendance.present}
          </strong>{" "}
          present ·{" "}
          <strong style={{ color: P.ink, fontWeight: 600 }}>
            {row.attendance.absent}
          </strong>{" "}
          absent ·{" "}
          <strong style={{ color: P.ink, fontWeight: 600 }}>
            {row.attendance.excused}
          </strong>{" "}
          excused
        </div>
      ) : null}

      {submittedLine ? (
        <div
          style={{
            fontFamily: fontSans,
            fontSize: 11,
            letterSpacing: 0.4,
            color: P.ink3,
            textTransform: "uppercase",
          }}
        >
          Submitted by {submittedLine}
        </div>
      ) : null}

      {row.leaderNotePreview ? (
        <p
          style={{
            margin: 0,
            fontFamily: fontBody,
            fontSize: 13.5,
            color: P.ink2,
            lineHeight: 1.55,
            fontStyle: "italic",
            borderLeft: `2px solid ${P.line}`,
            paddingLeft: 12,
          }}
        >
          &ldquo;{row.leaderNotePreview}&rdquo;
        </p>
      ) : null}
    </article>
  );
}

export function CheckInReviewShell({
  data,
  meetingWeek,
  weekOptions,
}: {
  data: WeeklyReviewData;
  meetingWeek: string;
  weekOptions: WeekOption[];
}) {
  const anyError =
    data.errors.groups ||
    data.errors.leaders ||
    data.errors.profiles ||
    data.errors.sessions ||
    data.errors.records ||
    data.errors.health ||
    data.errors.settings;

  const everyoneIn =
    data.summary.totalActive > 0 && data.summary.missing === 0;

  return (
    <div style={{ display: "grid", gap: 36 }}>
      {anyError ? (
        <ErrorBanner>
          Some sections couldn&rsquo;t load. The page below shows what we did
          get; retry in a moment or check the Supabase connection.
        </ErrorBanner>
      ) : null}

      <section style={{ display: "grid", gap: 18 }}>
        <SectionHeader
          eyebrow="This week"
          title={formatWeekLabel(meetingWeek)}
          description="Pick a different Monday to scroll back through prior weeks. Closed groups stay out of these totals."
        />
        <WeekSelector
          meetingWeek={meetingWeek}
          weekOptions={weekOptions}
          formAction="/admin/check-ins"
          selectId="check-in-week"
        />
        <div
          className="lg-m-grid-stack"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 12,
          }}
        >
          <SummaryTile label="Active groups" value={data.summary.totalActive} />
          <SummaryTile label="Submitted" value={data.summary.submitted} />
          <SummaryTile
            label="Missing"
            value={data.summary.missing}
            tone={data.summary.missing > 0 ? "missing" : undefined}
          />
          <SummaryTile label="Did not meet" value={data.summary.didNotMeet} />
          <SummaryTile label="Planned pause" value={data.summary.plannedPause} />
          <SummaryTile
            label="Needs follow-up"
            value={data.summary.needsFollowUp}
            tone={data.summary.needsFollowUp > 0 ? "followup" : undefined}
          />
        </div>
      </section>

      <section style={{ display: "grid", gap: 18 }}>
        <SectionHeader
          eyebrow="Groups"
          title="The week in review"
          description="Missing groups float to the top. Tap a card to read the leader's full note and the member-by-member attendance."
        />
        {everyoneIn ? (
          <div
            role="status"
            style={{
              background: P.sageSoft,
              border: `1px solid ${P.sage}`,
              borderLeft: `3px solid ${P.sage}`,
              borderRadius: 8,
              padding: "12px 16px",
              fontFamily: fontBody,
              fontSize: 13.5,
              color: "#3e4f29",
            }}
          >
            Everyone is in for this week. Nothing missing across the active
            roster.
          </div>
        ) : null}
        {data.rows.length === 0 ? (
          <Empty
            title="No groups to review"
            description="Once you have at least one open Life Group, it'll appear here. Closed groups are intentionally hidden from the weekly review."
          />
        ) : (
          <ul style={listResetStyle}>
            {data.rows.map((row) => (
              <li key={row.groupId} style={{ marginBottom: 14 }}>
                <ReviewCard row={row} meetingWeek={meetingWeek} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
