import Link from "next/link";
import { PBadge, type PTone } from "@/components/pastoral/atoms";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";
import {
  formatMeetingDate,
  formatSubmittedAt,
  formatWeekLabel,
  lifecycleStatusLabel,
  type CheckInDetailData,
  type CheckInDetailMember,
  type LeaderPulseDisplay,
  type SessionReviewStatus,
} from "@/lib/admin/check-ins";

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

function statusBadge(status: SessionReviewStatus) {
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

function attendanceBadge(status: CheckInDetailMember["attendanceStatus"]) {
  if (status === "present") return <PBadge tone="healthy">Present</PBadge>;
  if (status === "absent") return <PBadge tone="followup">Absent</PBadge>;
  if (status === "excused") return <PBadge tone="watch">Excused</PBadge>;
  return (
    <PBadge tone="neutral" outline>
      Not recorded
    </PBadge>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: fontSans,
        fontSize: 10,
        letterSpacing: 1.8,
        textTransform: "uppercase",
        color: P.ink3,
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
}

function FieldRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(120px, 160px) 1fr",
        gap: 16,
        alignItems: "baseline",
      }}
    >
      <div
        style={{
          fontFamily: fontSans,
          fontSize: 11,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          color: P.ink3,
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: fontBody,
          fontSize: 14,
          color: P.ink,
          lineHeight: 1.55,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 12,
        padding: "20px 24px",
        display: "grid",
        gap: 14,
      }}
    >
      {children}
    </div>
  );
}

function EmptySessionCard({ meetingWeek }: { meetingWeek: string }) {
  return (
    <div
      style={{
        background: P.sageSoft,
        border: `1px solid ${P.sage}`,
        borderLeft: `3px solid ${P.sage}`,
        borderRadius: 12,
        padding: "20px 24px",
        display: "grid",
        gap: 8,
      }}
    >
      <div
        style={{
          fontFamily: fontDisplay,
          fontSize: 18,
          color: P.ink,
          fontWeight: 500,
        }}
      >
        No check-in yet for {formatWeekLabel(meetingWeek).toLowerCase()}.
      </div>
      <p
        style={{
          margin: 0,
          fontFamily: fontBody,
          fontSize: 13.5,
          color: "#3e4f29",
          lineHeight: 1.55,
        }}
      >
        The leader hasn&rsquo;t submitted this group&rsquo;s check-in. The
        roster below shows who would be marked.
      </p>
    </div>
  );
}

function ClosedBanner({ closedAt }: { closedAt: string | null }) {
  return (
    <div
      role="note"
      style={{
        background: "#e2dfd3",
        border: `1px solid #8a8166`,
        borderLeft: `3px solid #8a8166`,
        borderRadius: 8,
        padding: "12px 16px",
        fontFamily: fontBody,
        fontSize: 13.5,
        color: "#5c5848",
      }}
    >
      This group is closed
      {closedAt ? ` (as of ${new Date(closedAt).toLocaleDateString()})` : ""}.
      You&rsquo;re looking at read-only history.
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

const listResetStyle = { listStyle: "none", padding: 0, margin: 0 } as const;

export function CheckInDetailShell({
  data,
  meetingWeek,
}: {
  data: CheckInDetailData;
  meetingWeek: string;
}) {
  const anyError =
    data.errors.group ||
    data.errors.leaders ||
    data.errors.profiles ||
    data.errors.session ||
    data.errors.records ||
    data.errors.health ||
    data.errors.memberships ||
    data.errors.members;

  const { group, session, sessionStatus, health, members } = data;
  const meta = group ? meetingLine(group.meeting_day, group.meeting_time) : null;
  const isClosed = group?.lifecycle_status === "closed";
  const showCounts =
    sessionStatus === "submitted" || sessionStatus === "admin_entered";

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <Link
        href={`/admin/check-ins?week=${meetingWeek}`}
        style={{
          fontFamily: fontSans,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: 0.4,
          color: P.ink2,
          textDecoration: "none",
          width: "fit-content",
        }}
      >
        ← Back to all check-ins
      </Link>

      {anyError ? (
        <ErrorBanner>
          Some sections couldn&rsquo;t load. The page below shows what we did
          get; retry in a moment or check the Supabase connection.
        </ErrorBanner>
      ) : null}

      {isClosed && group ? <ClosedBanner closedAt={group.closed_at} /> : null}

      {group ? (
        <div
          style={{
            display: "grid",
            gap: 6,
          }}
        >
          <SectionLabel>{formatWeekLabel(meetingWeek)}</SectionLabel>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <h2
              style={{
                margin: 0,
                fontFamily: fontDisplay,
                fontSize: 28,
                fontWeight: 500,
                color: P.ink,
                letterSpacing: -0.4,
              }}
            >
              {group.name}
            </h2>
            {statusBadge(sessionStatus)}
            <PBadge tone="neutral" outline>
              {lifecycleStatusLabel(group.lifecycle_status)}
            </PBadge>
          </div>
          <div
            style={{
              fontFamily: fontBody,
              fontSize: 14,
              color: P.ink2,
            }}
          >
            {data.leaderNames.length > 0
              ? data.leaderNames.join(" · ")
              : "No leaders assigned"}
            {meta ? ` · ${meta}` : ""}
          </div>
        </div>
      ) : null}

      {!group ? (
        <ErrorBanner>
          We couldn&rsquo;t find that group. It may have been removed.
        </ErrorBanner>
      ) : !session ? (
        <EmptySessionCard meetingWeek={meetingWeek} />
      ) : (
        <Card>
          <SectionLabel>Check-in</SectionLabel>
          <FieldRow label="Status" value={statusBadge(sessionStatus)} />
          <FieldRow
            label="Meeting date"
            value={formatMeetingDate(session.meeting_date) ?? "—"}
          />
          <FieldRow
            label="Submitted by"
            value={data.submittedByName ?? "Unknown"}
          />
          <FieldRow
            label="Submitted at"
            value={formatSubmittedAt(session.submitted_at) ?? "—"}
          />
          {showCounts && data.attendance ? (
            <FieldRow
              label="Attendance"
              value={
                <span>
                  <strong style={{ fontWeight: 600 }}>
                    {data.attendance.present}
                  </strong>{" "}
                  present ·{" "}
                  <strong style={{ fontWeight: 600 }}>
                    {data.attendance.absent}
                  </strong>{" "}
                  absent ·{" "}
                  <strong style={{ fontWeight: 600 }}>
                    {data.attendance.excused}
                  </strong>{" "}
                  excused
                </span>
              }
            />
          ) : null}
          {session.leader_note ? (
            <div style={{ display: "grid", gap: 6 }}>
              <SectionLabel>Leader note</SectionLabel>
              <p
                style={{
                  margin: 0,
                  fontFamily: fontBody,
                  fontSize: 14,
                  color: P.ink,
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                }}
              >
                {session.leader_note}
              </p>
            </div>
          ) : null}
          {session.admin_note ? (
            <div style={{ display: "grid", gap: 6 }}>
              <SectionLabel>Admin note</SectionLabel>
              <p
                style={{
                  margin: 0,
                  fontFamily: fontBody,
                  fontSize: 14,
                  color: P.ink,
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                }}
              >
                {session.admin_note}
              </p>
            </div>
          ) : null}
        </Card>
      )}

      {health ? (
        <Card>
          <SectionLabel>Health pulse</SectionLabel>
          <FieldRow
            label="Pulse"
            value={
              health.pulse === "healthy" ||
              health.pulse === "watch" ||
              health.pulse === "needs_follow_up" ? (
                <PBadge
                  tone={PULSE_LABELS[health.pulse].tone}
                  outline
                >
                  {PULSE_LABELS[health.pulse].label}
                </PBadge>
              ) : (
                <PBadge tone="neutral" outline>
                  {health.pulse.replace(/_/g, " ")}
                </PBadge>
              )
            }
          />
          <FieldRow
            label="Follow-up flag"
            value={
              health.follow_up_needed ? (
                <PBadge tone="followup">Follow-up needed</PBadge>
              ) : (
                <span style={{ color: P.ink3 }}>None requested</span>
              )
            }
          />
          {health.leader_note ? (
            <div style={{ display: "grid", gap: 6 }}>
              <SectionLabel>Pulse · leader note</SectionLabel>
              <p
                style={{
                  margin: 0,
                  fontFamily: fontBody,
                  fontSize: 14,
                  color: P.ink,
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                }}
              >
                {health.leader_note}
              </p>
            </div>
          ) : null}
          {health.admin_note ? (
            <div style={{ display: "grid", gap: 6 }}>
              <SectionLabel>Pulse · admin note</SectionLabel>
              <p
                style={{
                  margin: 0,
                  fontFamily: fontBody,
                  fontSize: 14,
                  color: P.ink,
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                }}
              >
                {health.admin_note}
              </p>
            </div>
          ) : null}
        </Card>
      ) : null}

      <section style={{ display: "grid", gap: 14 }}>
        <SectionLabel>Roster · {members.length} active</SectionLabel>
        {members.length === 0 ? (
          <div
            style={{
              background: P.surface,
              border: `1px dashed ${P.line}`,
              borderRadius: 10,
              padding: "18px 20px",
              fontFamily: fontBody,
              fontSize: 13.5,
              color: P.ink2,
            }}
          >
            No active members on this group yet.
          </div>
        ) : (
          <ul style={listResetStyle}>
            {members.map((m) => (
              <li key={m.memberId} style={{ marginBottom: 8 }}>
                <div
                  style={{
                    background: P.surface,
                    border: `1px solid ${P.line}`,
                    borderRadius: 10,
                    padding: "12px 16px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <span
                    style={{
                      fontFamily: fontBody,
                      fontSize: 14,
                      color: P.ink,
                    }}
                  >
                    {m.fullName}
                  </span>
                  {attendanceBadge(m.attendanceStatus)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
