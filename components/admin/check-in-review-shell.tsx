import Link from "next/link";
import { PULSE_LABELS } from "@/components/admin/check-in-pulse";
import { SectionHeader } from "@/components/layout/shell";
import { PBadge } from "@/components/pastoral/atoms";
import { WeekSelector } from "@/components/admin/week-selector";
import { buttonClassName } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatSubmittedAt,
  formatWeekLabel,
  lifecycleStatusLabel,
  type GroupReviewRow,
  type LeaderPulseDisplay,
  type WeekOption,
  type WeeklyReviewData,
} from "@/lib/admin/check-ins";
import { meetingLine } from "@/lib/shared/meeting-time";
import { SessionStatusBadge } from "@/components/admin/session-status-badge";
import { AttendanceSummary } from "@/components/admin/attendance-summary";

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
  // Tone is carried by the figure color (clay = needs follow-up) — never a
  // stripe. Sentence-case label, serif figure (design-direction §4 Cards).
  const accented = tone === "missing" || tone === "followup";
  return (
    <div className="grid gap-1 rounded-sm border border-line bg-surface px-4 py-3.5">
      <div
        className={cn(
          "font-display text-3xl font-medium tabular-nums leading-none",
          accented ? "text-clay" : "text-ink"
        )}
      >
        {value}
      </div>
      <div
        className={cn(
          "font-sans text-sm",
          accented ? "text-clayDeep" : "text-ink3"
        )}
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
      className="rounded-sm border border-clay bg-claySoft px-3.5 py-3 font-sans text-sm text-clayDeep"
    >
      {children}
    </div>
  );
}

function Empty({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-sm border border-dashed border-line bg-surface px-6 py-[22px] text-center">
      <div className="mb-1.5 font-display text-lg font-medium text-ink">
        {title}
      </div>
      <p className="m-0 font-sans text-sm leading-normal text-ink2">
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
  // Tone tints the whole card surface (token classes, no stripe): clay for a
  // missing check-in, an amber border for an open follow-up flag.
  const highlight =
    row.sessionStatus === "missing" && row.isActive && row.isScheduledThisWeek
      ? "border-clay bg-claySoft"
      : row.followUpNeeded
        ? "border-amber bg-surface"
        : "border-line bg-surface";

  return (
    <article className={cn("grid gap-3 rounded-lg border p-card", highlight)}>
      <header className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto] md:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="m-0 font-display text-lg font-medium text-ink">
              {row.groupName}
            </h3>
            <SessionStatusBadge
              status={row.sessionStatus}
              isScheduledThisWeek={row.isScheduledThisWeek}
            />
            {lifecycleBadge(row)}
            {row.followUpNeeded ? (
              <PBadge tone="followup">Follow-up needed</PBadge>
            ) : null}
            {pulseBadge(row.healthPulse)}
          </div>
          {row.leaderNames.length > 0 ? (
            <div className="mt-1 font-sans text-sm text-ink2">
              {row.leaderNames.join(" · ")}
            </div>
          ) : (
            <div className="mt-1 font-sans text-sm italic text-ink3">
              No shepherds assigned
            </div>
          )}
          {meta ? (
            <div className="mt-0.5 font-sans text-sm text-ink3">{meta}</div>
          ) : null}
          {row.dueLabel ? (
            <div
              className={cn(
                "mt-1 font-sans text-sm",
                row.isOverdue ? "text-clayDeep" : "text-ink3"
              )}
            >
              {row.isOverdue
                ? `Overdue · was due ${row.dueLabel}`
                : `Check-in due ${row.dueLabel}`}
              {row.dueRelative ? ` · ${row.dueRelative}` : ""}
            </div>
          ) : !row.isScheduledThisWeek && row.isActive ? (
            <div className="mt-1 font-sans text-sm italic text-ink3">
              Bi-weekly off-parity &mdash; this group wasn&rsquo;t scheduled to
              meet this week.
            </div>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-2">
          <Link
            href={`/admin/check-ins/${row.groupId}?week=${meetingWeek}`}
            className={buttonClassName("ghost", "sm")}
          >
            View details →
          </Link>
        </div>
      </header>

      {row.attendance ? (
        <div className="font-sans text-sm text-ink2">
          <AttendanceSummary attendance={row.attendance} />
        </div>
      ) : null}

      {submittedLine ? (
        <div className="font-sans text-sm text-ink3">
          Submitted by {submittedLine}
        </div>
      ) : null}

      {row.leaderNotePreview ? (
        // Quote sits on a surfaceAlt strip — never a side stripe.
        <p className="m-0 rounded-sm bg-surfaceAlt px-3.5 py-2.5 font-sans text-sm italic leading-normal text-ink2">
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
  const anyError = Object.values(data.errors).some((e) => e != null);

  const everyoneIn = data.summary.totalActive > 0 && data.summary.missing === 0;

  return (
    <div className="grid gap-9">
      {anyError ? (
        <ErrorBanner>
          Some sections couldn&rsquo;t load. The page below shows what we did
          get; retry in a moment or check the database connection.
        </ErrorBanner>
      ) : null}

      <section className="grid gap-[18px]">
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
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[repeat(auto-fit,minmax(140px,1fr))]">
          <SummaryTile label="Active groups" value={data.summary.totalActive} />
          <SummaryTile label="Submitted" value={data.summary.submitted} />
          <SummaryTile
            label="Missing"
            value={data.summary.missing}
            tone={data.summary.missing > 0 ? "missing" : undefined}
          />
          <SummaryTile label="Did not meet" value={data.summary.didNotMeet} />
          <SummaryTile
            label="Planned pause"
            value={data.summary.plannedPause}
          />
          <SummaryTile
            label="Needs follow-up"
            value={data.summary.needsFollowUp}
            tone={data.summary.needsFollowUp > 0 ? "followup" : undefined}
          />
        </div>
      </section>

      <section className="grid gap-[18px]">
        <SectionHeader
          eyebrow="Groups"
          title="The week in review"
          description="Missing groups float to the top. Tap a card to read the shepherd's full note and the member-by-member attendance."
        />
        {everyoneIn ? (
          // All-clear tone is a sage status dot on a soft tint — never a side
          // stripe (mirrors the dashboard AllClear row).
          <div
            role="status"
            className="flex items-center gap-3 rounded-sm border border-line bg-sageSoft px-4 py-3 font-sans text-sm text-sageDeep"
          >
            <span
              aria-hidden="true"
              className="h-2 w-2 shrink-0 rounded-pill bg-sage"
            />
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
          <ul className="m-0 list-none p-0">
            {data.rows.map((row) => (
              <li key={row.groupId} className="mb-3.5">
                <ReviewCard row={row} meetingWeek={meetingWeek} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
