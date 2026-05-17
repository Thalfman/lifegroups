import { Check } from "lucide-react";
import { EmptyState, StatusCard } from "@/components/dashboard/cards";
import { HealthBadge, LifecycleBadge } from "@/components/dashboard/badges";
import { SectionHeader } from "@/components/layout/shell";
import { mapHealthToBadge, mapLifecycleToBadge } from "@/lib/dashboard/badge-map";
import {
  followUpPriorityLabel,
  followUpTypeLabel,
  sessionStatusLabel,
} from "@/lib/dashboard/labels";
import type { LeaderGroupDashboard } from "@/lib/dashboard/types";

export function LeaderGroupCard({ dashboard }: { dashboard: LeaderGroupDashboard }) {
  const { group, recentSessions, healthPulse, followUps } = dashboard;

  return (
    <section className="space-y-4 rounded-lg border bg-background p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{group.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{group.weekLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LifecycleBadge {...mapLifecycleToBadge(group.lifecycleStatus)} />
          <HealthBadge {...mapHealthToBadge(group.healthStatus)} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <StatusCard title="Group at a glance">
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>
              Meeting:{" "}
              <span className="text-foreground">
                {group.meetingDay ?? "TBD"}
                {group.meetingTime ? ` at ${group.meetingTime}` : ""}
              </span>
            </li>
            <li>
              Active members:{" "}
              <span className="text-foreground">
                {group.activeMembers}
                {group.capacity ? ` / ${group.capacity}` : ""}
              </span>
            </li>
          </ul>
        </StatusCard>

        <StatusCard title="Quick group pulse">
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>Attendance rhythm: {healthPulse.attendanceRhythm}</p>
            <p>
              New guest{healthPulse.newGuestsThisWeek === 1 ? "" : "s"} this week:{" "}
              {healthPulse.newGuestsThisWeek}
            </p>
            <p className="flex items-center gap-2">
              Current health: <HealthBadge {...mapHealthToBadge(healthPulse.currentHealth)} />
            </p>
            {healthPulse.leaderNote ? (
              <p className="rounded-md bg-muted/40 px-3 py-2 text-foreground">
                “{healthPulse.leaderNote}”
              </p>
            ) : null}
          </div>
        </StatusCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <StatusCard title="Recent attendance">
          {recentSessions.length === 0 ? (
            <EmptyState
              title="No sessions yet"
              description="Once a session is recorded, recent check-ins will appear here."
            />
          ) : (
            <ul className="space-y-2 text-sm">
              {recentSessions.map((session) => (
                <li
                  key={session.meetingWeek}
                  className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2"
                >
                  <span>Week of {session.meetingWeek}</span>
                  <span className="text-xs text-muted-foreground">
                    {sessionStatusLabel(session.status)} · {session.presentCount}P /{" "}
                    {session.absentCount}A / {session.excusedCount}E
                  </span>
                </li>
              ))}
            </ul>
          )}
        </StatusCard>

        <StatusCard title="Next follow-ups">
          {followUps.length === 0 ? (
            <EmptyState
              title="No open follow-ups"
              description="When admins assign follow-ups for this group, they'll appear here."
            />
          ) : (
            <ul className="space-y-2 text-sm">
              {followUps.map((item) => (
                <li key={item.id} className="rounded-md bg-muted/30 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">{item.title}</span>
                    <span className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {followUpPriorityLabel(item.priority)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {followUpTypeLabel(item.type)}
                    {item.dueDate ? ` · Due ${item.dueDate}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </StatusCard>
      </div>

      <div className="space-y-3">
        <SectionHeader
          title="Member roster"
          description="Member check-in arrives in Phase 5B once attendance write paths ship."
        />
        {group.members.length === 0 ? (
          <EmptyState
            title="No active members yet"
            description="Add members in Supabase or via admin tools to populate this list."
          />
        ) : (
          <ul className="surface-subtle space-y-2 p-3 sm:p-4">
            {group.members.map((member) => (
              <li
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-background px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate">{member.displayName}</span>
                <button
                  type="button"
                  disabled
                  title="Arrives in Phase 5B"
                  className="inline-flex min-h-9 items-center gap-2 rounded-md border px-3 py-1.5 text-xs text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label={`Mark ${member.displayName} present (arrives in Phase 5B)`}
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Present
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
