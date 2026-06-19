import Link from "next/link";
import { PULSE_LABELS } from "@/components/admin/check-in-pulse";
import { PBadge } from "@/components/pastoral/atoms";
import {
  formatMeetingDate,
  formatSubmittedAt,
  formatWeekLabel,
  lifecycleStatusLabel,
  type CheckInDetailData,
  type CheckInDetailMember,
} from "@/lib/admin/check-ins";
import { meetingLine } from "@/lib/shared/meeting-time";
import { SessionStatusBadge } from "@/components/admin/session-status-badge";
import { AttendanceSummary } from "@/components/admin/attendance-summary";

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
    <div className="font-sans text-xs font-semibold text-ink3">{children}</div>
  );
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(120px,160px)_1fr] md:items-baseline md:gap-4">
      <div className="font-sans text-xs font-semibold text-ink3">{label}</div>
      <div className="font-sans text-base text-ink">{value}</div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-3.5 rounded-lg border border-line bg-surface p-card">
      {children}
    </div>
  );
}

function EmptySessionCard({ meetingWeek }: { meetingWeek: string }) {
  // Tone is a sage status dot on a soft tint — never a side stripe.
  return (
    <div className="grid gap-2 rounded-lg border border-line bg-sageSoft p-card">
      <div className="flex items-center gap-2.5 font-display text-lg font-medium text-ink">
        <span
          aria-hidden="true"
          className="h-2 w-2 shrink-0 rounded-pill bg-sage"
        />
        No check-in yet for {formatWeekLabel(meetingWeek).toLowerCase()}.
      </div>
      <p className="m-0 font-sans text-sm leading-normal text-sageDeep">
        The leader hasn&rsquo;t submitted this group&rsquo;s check-in. The
        roster below shows who would be marked.
      </p>
    </div>
  );
}

function ClosedBanner({ closedAt }: { closedAt: string | null }) {
  // A quiet read-only aside: surfaceAlt strip, no stripe, no accent.
  return (
    <div
      role="note"
      className="rounded-sm border border-line bg-surfaceAlt px-4 py-3 font-sans text-sm text-ink2"
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
      className="rounded-sm border border-clay bg-claySoft px-3.5 py-3 font-sans text-sm text-clayDeep"
    >
      {children}
    </div>
  );
}

export function CheckInDetailShell({
  data,
  meetingWeek,
}: {
  data: CheckInDetailData;
  meetingWeek: string;
}) {
  const anyError = Object.values(data.errors).some(Boolean);

  const { group, session, sessionStatus, health, members } = data;
  const meta = group
    ? meetingLine(group.meeting_day, group.meeting_time)
    : null;
  const isClosed = group?.lifecycle_status === "closed";
  const showCounts =
    sessionStatus === "submitted" || sessionStatus === "admin_entered";

  return (
    <div className="grid gap-6">
      <Link
        href={`/admin/check-ins?week=${meetingWeek}`}
        className="w-fit font-sans text-xs font-semibold text-ink2 no-underline transition-colors duration-150 hover:text-ink"
      >
        ← Back to all check-ins
      </Link>

      {anyError ? (
        <ErrorBanner>
          Some sections couldn&rsquo;t load. The page below shows what we did
          get; retry in a moment or check the database connection.
        </ErrorBanner>
      ) : null}

      {isClosed && group ? <ClosedBanner closedAt={group.closed_at} /> : null}

      {group ? (
        <div className="grid gap-1.5">
          <SectionLabel>{formatWeekLabel(meetingWeek)}</SectionLabel>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="m-0 font-display text-2xl font-medium text-ink">
              {group.name}
            </h2>
            <SessionStatusBadge status={sessionStatus} />
            <PBadge tone="neutral" outline>
              {lifecycleStatusLabel(group.lifecycle_status)}
            </PBadge>
          </div>
          <div className="font-sans text-base text-ink2">
            {data.leaderNames.length > 0
              ? data.leaderNames.join(" · ")
              : "No shepherds assigned"}
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
          <FieldRow
            label="Status"
            value={<SessionStatusBadge status={sessionStatus} />}
          />
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
                  <AttendanceSummary attendance={data.attendance} />
                </span>
              }
            />
          ) : null}
          {session.leader_note ? (
            <div className="grid gap-1.5">
              <SectionLabel>Shepherd note</SectionLabel>
              <p className="m-0 whitespace-pre-wrap font-sans text-base leading-relaxed text-ink">
                {session.leader_note}
              </p>
            </div>
          ) : null}
          {session.admin_note ? (
            <div className="grid gap-1.5">
              <SectionLabel>Admin note</SectionLabel>
              <p className="m-0 whitespace-pre-wrap font-sans text-base leading-relaxed text-ink">
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
                <PBadge tone={PULSE_LABELS[health.pulse].tone} outline>
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
                <span className="text-ink3">None requested</span>
              )
            }
          />
          {health.leader_note ? (
            <div className="grid gap-1.5">
              <SectionLabel>Pulse · shepherd note</SectionLabel>
              <p className="m-0 whitespace-pre-wrap font-sans text-base leading-relaxed text-ink">
                {health.leader_note}
              </p>
            </div>
          ) : null}
          {health.admin_note ? (
            <div className="grid gap-1.5">
              <SectionLabel>Pulse · admin note</SectionLabel>
              <p className="m-0 whitespace-pre-wrap font-sans text-base leading-relaxed text-ink">
                {health.admin_note}
              </p>
            </div>
          ) : null}
        </Card>
      ) : null}

      <section className="grid gap-3.5">
        <SectionLabel>Roster · {members.length} active</SectionLabel>
        {members.length === 0 ? (
          <div className="rounded-sm border border-dashed border-line bg-surface px-5 py-[18px] font-sans text-sm text-ink2">
            No active members on this group yet.
          </div>
        ) : (
          <ul className="m-0 list-none p-0">
            {members.map((m) => (
              <li key={m.memberId} className="mb-2">
                <div className="flex min-h-11 items-center justify-between gap-3 rounded-sm border border-line bg-surface px-4 py-3">
                  <span className="font-sans text-base text-ink">
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
