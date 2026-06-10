import Link from "next/link";
import { PAvatar, PBadge } from "@/components/pastoral/atoms";
import { EmptyState, StatusCard } from "@/components/dashboard/cards";
import { HealthBadge, LifecycleBadge } from "@/components/dashboard/badges";
import { LeaderQuickDidNotMeet } from "@/components/leader/quick-did-not-meet";
import { UpcomingEventsStrip } from "@/components/calendar/upcoming-events-strip";
import { buttonClassName } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  mapHealthToBadge,
  mapLifecycleToBadge,
} from "@/lib/dashboard/badge-map";
import {
  followUpPriorityLabel,
  followUpTypeLabel,
  sessionStatusLabel,
} from "@/lib/dashboard/labels";
import type { LeaderGroupDashboard } from "@/lib/dashboard/types";

function priorityToTone(priority: string) {
  if (priority === "high") return "followup" as const;
  if (priority === "normal") return "watch" as const;
  return "neutral" as const;
}

function describeWeek(meetingWeekIso: string): string {
  const date = new Date(`${meetingWeekIso}T00:00:00Z`);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function LeaderGroupCard({
  dashboard,
}: {
  dashboard: LeaderGroupDashboard;
}) {
  const {
    group,
    recentSessions,
    healthPulse,
    followUps,
    currentWeek,
    upcomingEvents,
  } = dashboard;
  const calendarHref = `/leader/${group.groupId}/calendar`;
  const lifecycle = mapLifecycleToBadge(group.lifecycleStatus);
  const health = mapHealthToBadge(group.healthStatus);
  const closed = group.lifecycleStatus === "closed";
  const submitted = currentWeek.alreadySubmitted;
  const checkinHref = `/leader/${group.groupId}/checkin`;
  const ctaLabel = submitted ? "Update check-in" : "Start check-in";
  const heroEyebrow = submitted ? "Saved for this week" : "This week";
  const heroTitle = submitted ? (
    <>
      Anything to <span className="italic">add?</span>
    </>
  ) : (
    <>
      How did <span className="italic">tonight</span> go?
    </>
  );
  const heroLede = submitted
    ? "You can update tonight's check-in any time. We'll keep the record fresh."
    : "Tap each person as you remember them. We'll save it when you submit.";

  return (
    <section className="grid gap-4 rounded-lg border border-line bg-surface p-card">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 font-sans text-xs text-ink3">
            {group.weekLabel}
          </div>
          <h2 className="m-0 font-display text-2xl font-medium leading-tight text-ink md:text-3xl">
            {group.name}
          </h2>
          <div className="mt-1.5 font-sans text-base italic text-ink2">
            {group.meetingDay ?? "TBD"}
            {group.meetingTime ? ` · ${group.meetingTime}` : ""}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <LifecycleBadge {...lifecycle} />
          <HealthBadge {...health} />
        </div>
      </header>

      <UpcomingEventsStrip
        events={upcomingEvents}
        calendarHref={calendarHref}
        eyebrow="Calendar · next up"
      />

      <div className="relative overflow-hidden rounded-lg bg-clay p-card text-surface">
        <div
          aria-hidden="true"
          className="absolute -right-[30px] -top-[30px] h-[120px] w-[120px] rounded-pill bg-white/[0.06]"
        />
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <div className="font-sans text-xs font-medium opacity-85">
            {heroEyebrow}
          </div>
          {submitted ? (
            <span className="inline-flex items-center rounded-pill bg-white/20 px-2.5 py-0.5 font-sans text-xs font-medium">
              {sessionStatusLabel(currentWeek.status)}
            </span>
          ) : null}
        </div>
        <div className="mb-1.5 font-display text-2xl font-medium leading-tight">
          {heroTitle}
        </div>
        <div className="mb-4 font-sans text-base leading-relaxed opacity-90">
          {heroLede}
        </div>
        {submitted && currentWeek.status === "submitted" ? (
          <div className="mb-3.5 font-mono text-xs opacity-90">
            {currentWeek.presentCount}P · {currentWeek.absentCount}A ·{" "}
            {currentWeek.excusedCount}E
            {currentWeek.meetingDate ? ` · ${currentWeek.meetingDate}` : ""}
          </div>
        ) : null}
        {closed ? (
          <div className="rounded-sm bg-white/10 px-3.5 py-2.5 font-sans text-sm italic opacity-85">
            This group is closed. Check-ins are turned off; ask an admin to
            reopen it if it should be active again.
          </div>
        ) : (
          <div className="grid gap-2.5">
            <Link
              href={checkinHref}
              className={cn(
                buttonClassName("primary", "md"),
                // The one primary on this card, inverted for the clay band.
                "w-full bg-surface font-semibold text-clay hover:bg-bg"
              )}
            >
              {ctaLabel}
            </Link>
            {submitted ? null : (
              <LeaderQuickDidNotMeet
                groupId={group.groupId}
                groupName={group.name}
              />
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StatusCard title="This week at a glance" eyebrow="Group">
          {(
            [
              ["Rhythm", healthPulse.attendanceRhythm],
              ["New guests", `${healthPulse.newGuestsThisWeek} this week`],
              [
                "Members",
                `${group.activeMembers}${group.capacity ? ` of ${group.capacity}` : ""} active`,
              ],
            ] as const
          ).map(([k, v], i, arr) => (
            <div
              key={k}
              className={cn(
                "flex justify-between gap-2.5 py-2.5",
                i < arr.length - 1 && "border-b border-lineSoft"
              )}
            >
              <span className="font-sans text-sm italic text-ink2">{k}</span>
              <span className="text-right font-sans text-sm font-medium text-ink">
                {v}
              </span>
            </div>
          ))}
          <div className="mt-1 flex items-center justify-between gap-2.5 pt-2.5">
            <span className="font-sans text-sm italic text-ink2">
              Current health
            </span>
            <HealthBadge {...mapHealthToBadge(healthPulse.currentHealth)} />
          </div>
          {healthPulse.leaderNote ? (
            // In-card grouping on a surfaceAlt tint — the old clay side-stripe
            // is restructured away, not recolored.
            <div className="mt-3.5 rounded-sm bg-surfaceAlt px-4 py-3 font-sans text-base italic leading-relaxed text-ink">
              &ldquo;{healthPulse.leaderNote}&rdquo;
            </div>
          ) : null}
        </StatusCard>

        <StatusCard title="Recent attendance" eyebrow="Last 4 sessions">
          {recentSessions.length === 0 ? (
            <EmptyState
              title="No sessions yet"
              description="Once a session is recorded, recent check-ins will appear here."
            />
          ) : (
            <ul className="m-0 list-none p-0">
              {recentSessions.map((session, i, arr) => (
                <li
                  key={session.meetingWeek}
                  className={cn(
                    "flex flex-wrap justify-between gap-x-3 gap-y-1 py-3",
                    i < arr.length - 1 && "border-b border-lineSoft"
                  )}
                >
                  <span className="font-sans text-sm text-ink">
                    Week of {describeWeek(session.meetingWeek)}
                  </span>
                  <span className="inline-flex items-baseline gap-2 whitespace-nowrap">
                    <span className="font-sans text-xs italic text-ink2">
                      {sessionStatusLabel(session.status)}
                    </span>
                    <span className="font-mono text-2xs text-ink2">
                      {session.presentCount}P · {session.absentCount}A ·{" "}
                      {session.excusedCount}E
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </StatusCard>

        <StatusCard title="Next follow-ups" eyebrow="Open threads">
          {followUps.length === 0 ? (
            <EmptyState
              title="No open follow-ups"
              description="When admins assign follow-ups for this group, they'll appear here."
            />
          ) : (
            <ul className="m-0 list-none p-0">
              {followUps.map((item, i, arr) => (
                <li
                  key={item.id}
                  className={cn(
                    "py-3",
                    i < arr.length - 1 && "border-b border-lineSoft"
                  )}
                >
                  <div className="mb-1 flex items-start justify-between gap-2.5">
                    <span className="font-sans text-base font-medium text-ink">
                      {item.title}
                    </span>
                    <PBadge tone={priorityToTone(item.priority)}>
                      {followUpPriorityLabel(item.priority)}
                    </PBadge>
                  </div>
                  <div className="font-sans text-xs italic text-ink2">
                    {followUpTypeLabel(item.type)}
                    {item.dueDate ? ` · Due ${item.dueDate}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </StatusCard>
      </div>

      <div>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <div>
            <div className="mb-1 font-sans text-xs text-ink3">Roster</div>
            <div className="font-display text-lg font-medium text-ink">
              The people of {group.name}
            </div>
          </div>
          <span className="font-sans text-sm text-ink3">
            Tap each person inside the check-in
          </span>
        </div>
        {group.members.length === 0 ? (
          <EmptyState
            title="No active members yet"
            description="Ask an admin to add members in the people screen, or submit 'Group did not meet' if there's no roster to mark."
          />
        ) : (
          <ul className="m-0 list-none overflow-hidden rounded-lg border border-lineSoft bg-bg p-0">
            {group.members.map((member, i, arr) => (
              <li
                key={member.id}
                className={cn(
                  "lg-m-roster-row flex flex-wrap items-center justify-between gap-3 bg-surface px-4 py-3",
                  i < arr.length - 1 && "border-b border-lineSoft"
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <PAvatar name={member.displayName} size={32} tone="terra" />
                  <span className="font-sans text-base font-medium text-ink">
                    {member.displayName}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
