import { ActionCard, EmptyState, StatusCard } from "@/components/dashboard/cards";
import { HealthBadge, LifecycleBadge } from "@/components/dashboard/badges";
import { AppShell, SectionHeader } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { DataSourceBadge } from "@/components/dashboard/data-source-badge";
import {
  ConfiguredDataNotice,
  DashboardErrorNotice,
  FallbackDataNotice,
} from "@/components/dashboard/notices";
import { getLeaderDashboardData } from "@/lib/dashboard/queries";
import { mapHealthToBadge, mapLifecycleToBadge } from "@/lib/dashboard/badge-map";
import {
  followUpPriorityLabel,
  followUpTypeLabel,
  sessionStatusLabel,
} from "@/lib/dashboard/labels";

export const dynamic = "force-dynamic";

export default async function LeaderPreviewPage() {
  const { source, data, error } = await getLeaderDashboardData();
  const group = data.group;

  return (
    <AppShell
      title="Leader Workflow Preview"
      subtitle="Weekly check-in flow connected to the assigned group's read-only Supabase data."
      headerSlot={<DataSourceBadge source={source} />}
    >
      {source === "live" ? <ConfiguredDataNotice /> : <FallbackDataNotice />}
      {error ? <DashboardErrorNotice message={error} /> : null}

      {!group ? (
        <EmptyState
          title="No assigned group yet"
          description="When a leader has an active group assignment, their workflow will load here."
        />
      ) : (
        <>
          <section className="grid gap-4 lg:grid-cols-2">
            <ActionCard
              title="This week's check-in"
              description={`${group.name} · ${group.weekLabel}`}
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <Button>Submit check-in</Button>
                  <Button variant="outline">Did not meet</Button>
                  <LifecycleBadge {...mapLifecycleToBadge(group.lifecycleStatus)} />
                </div>
              }
            />
            <StatusCard title="Quick group pulse">
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Attendance rhythm: {data.healthPulse.attendanceRhythm}</p>
                <p>
                  New guest{data.healthPulse.newGuestsThisWeek === 1 ? "" : "s"} this week:{" "}
                  {data.healthPulse.newGuestsThisWeek}
                </p>
                <p className="flex items-center gap-2">
                  Current health: <HealthBadge {...mapHealthToBadge(data.healthPulse.currentHealth)} />
                </p>
                {data.healthPulse.leaderNote ? (
                  <p className="rounded-md bg-background px-3 py-2 text-foreground">
                    “{data.healthPulse.leaderNote}”
                  </p>
                ) : null}
              </div>
            </StatusCard>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
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
            <StatusCard title="Recent attendance">
              {data.recentSessions.length === 0 ? (
                <EmptyState
                  title="No sessions yet"
                  description="Once a session is recorded, recent check-ins will appear here."
                />
              ) : (
                <ul className="space-y-2 text-sm">
                  {data.recentSessions.map((session) => (
                    <li
                      key={session.meetingWeek}
                      className="flex items-center justify-between rounded-md bg-background px-3 py-2"
                    >
                      <span>Week of {session.meetingWeek}</span>
                      <span className="text-xs text-muted-foreground">
                        {sessionStatusLabel(session.status)} · {session.presentCount}P / {session.absentCount}A /{" "}
                        {session.excusedCount}E
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </StatusCard>
          </section>

          <section className="space-y-4">
            <SectionHeader
              title="Member checklist preview"
              description="Leaders will tap names to mark present in a future write-enabled phase."
            />
            {group.members.length === 0 ? (
              <EmptyState
                title="No active members yet"
                description="Add members in Supabase or via Phase 4 admin tools to populate this list."
              />
            ) : (
              <ul className="surface-subtle space-y-2 p-4">
                {group.members.map((member) => (
                  <li
                    key={member.id}
                    className="flex items-center justify-between rounded-md bg-background px-3 py-2 text-sm"
                  >
                    <span>{member.displayName}</span>
                    <button
                      type="button"
                      disabled
                      className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs text-muted-foreground disabled:opacity-60"
                      aria-label={`Mark ${member.displayName} present (disabled in read-only phase)`}
                    >
                      <Check className="h-3.5 w-3.5" />
                      Present
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <ActionCard
              title="Add guest"
              description="Guest capture moves to Phase 4 once write-enabled flows arrive."
              action={
                <Button variant="outline" disabled>
                  Add guest
                </Button>
              }
            />
            <StatusCard title="Next follow-ups">
              {data.followUps.length === 0 ? (
                <EmptyState
                  title="No open follow-ups"
                  description="When admins assign follow-ups for this group, they'll appear here."
                />
              ) : (
                <ul className="space-y-2 text-sm">
                  {data.followUps.map((item) => (
                    <li key={item.id} className="rounded-md bg-background px-3 py-2">
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
          </section>
        </>
      )}
    </AppShell>
  );
}
