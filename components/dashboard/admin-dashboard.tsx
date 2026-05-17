import { EmptyState, MetricCard, StatusCard } from "@/components/dashboard/cards";
import { HealthBadge, LifecycleBadge } from "@/components/dashboard/badges";
import { SectionHeader } from "@/components/layout/shell";
import { mapHealthToBadge, mapLifecycleToBadge } from "@/lib/dashboard/badge-map";
import {
  followUpPriorityLabel,
  followUpTypeLabel,
} from "@/lib/dashboard/labels";
import type { AdminDashboardData } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

export function AdminDashboard({ data }: { data: AdminDashboardData }) {
  const totalPipeline = data.guestPipelineBreakdown.reduce((sum, row) => sum + row.count, 0);
  const largestStage = data.guestPipelineBreakdown.reduce<{
    label: string;
    count: number;
  } | null>((acc, row) => (acc && acc.count >= row.count ? acc : { label: row.label, count: row.count }), null);

  return (
    <>
      <section aria-labelledby="weekly-overview" className="space-y-3">
        <h2 id="weekly-overview" className="sr-only">
          Weekly overview
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Active groups"
            value={String(data.activeGroupCount)}
            meta={`${data.capacity.nearCapacityGroups} near capacity, ${data.capacity.fullGroups} full`}
          />
          <MetricCard
            title="Attendance this week"
            value={String(data.attendanceThisWeek)}
            meta={`Present check-ins for ${data.weekLabel}`}
          />
          <MetricCard
            title="Guests in pipeline"
            value={String(data.guestPipelineCount)}
            meta={`${totalPipeline} guests tracked across all stages`}
          />
          <MetricCard
            title="Missing check-ins"
            value={String(data.missingCheckInsCount)}
            meta="Sessions not submitted for the latest week"
          />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <StatusCard title="Active group health">
          {data.groupHealth.length === 0 ? (
            <EmptyState
              title="No groups yet"
              description="Group health rows will appear here once groups exist."
            />
          ) : (
            <ul className="space-y-3 text-sm">
              {data.groupHealth.map((row) => {
                const lifecycle = mapLifecycleToBadge(row.lifecycleStatus);
                const health = mapHealthToBadge(row.healthStatus);
                return (
                  <li
                    key={row.groupId}
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <span className="min-w-0 truncate">{row.name}</span>
                    <span className="flex shrink-0 flex-wrap gap-2">
                      <LifecycleBadge status={lifecycle.status} label={lifecycle.label} />
                      <HealthBadge tone={health.tone} label={health.label} />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </StatusCard>

        <StatusCard title="Capacity overview">
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              <strong className="text-foreground">{data.capacity.nearCapacityGroups}</strong>{" "}
              groups near full capacity.
            </p>
            <p>
              <strong className="text-foreground">{data.capacity.fullGroups}</strong> groups
              marked Capacity Full.
            </p>
            {data.capacity.rows.length === 0 ? (
              <EmptyState
                title="No active groups yet"
                description="Capacity usage will appear here once groups exist."
              />
            ) : (
              <ul className="space-y-2">
                {data.capacity.rows.map((row) => {
                  const pct =
                    row.utilization === null
                      ? null
                      : Math.min(1, Math.max(0, row.utilization));
                  const pctLabel = pct === null ? "capacity unknown" : `${Math.round(pct * 100)}%`;
                  const ariaLabel = `${row.name}: ${row.activeMembers}${row.capacity ? ` of ${row.capacity}` : ""} active members (${pctLabel})`;
                  return (
                    <li key={row.groupId} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-foreground">{row.name}</span>
                        <span className="tabular-nums">
                          {row.activeMembers}
                          {row.capacity ? ` / ${row.capacity}` : ""}
                        </span>
                      </div>
                      <div
                        className="h-2 overflow-hidden rounded-full bg-muted"
                        role="img"
                        aria-label={ariaLabel}
                      >
                        <div
                          className={cn(
                            "h-full rounded-full",
                            pct === null
                              ? "bg-slate-300"
                              : pct >= 1
                                ? "bg-rose-400"
                                : pct >= 0.8
                                  ? "bg-amber-400"
                                  : "bg-emerald-400",
                          )}
                          style={{ width: pct === null ? "10%" : `${Math.round(pct * 100)}%` }}
                          aria-hidden="true"
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </StatusCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <StatusCard title="Guest pipeline">
          {totalPipeline === 0 ? (
            <EmptyState
              title="No guests yet"
              description="Guests added in Supabase will appear in this pipeline."
            />
          ) : (
            <div className="space-y-3">
              <div
                className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
                role="img"
                aria-label={`Guest pipeline: ${totalPipeline} guest${totalPipeline === 1 ? "" : "s"} tracked${largestStage && largestStage.count > 0 ? `, most in ${largestStage.label}` : ""}.`}
              >
                {data.guestPipelineBreakdown.map((row, idx) => {
                  if (row.count === 0) return null;
                  const width = Math.round((row.count / totalPipeline) * 100);
                  const palette = [
                    "bg-sky-400",
                    "bg-indigo-400",
                    "bg-violet-400",
                    "bg-fuchsia-400",
                    "bg-emerald-400",
                    "bg-amber-400",
                    "bg-rose-400",
                  ];
                  return (
                    <div
                      key={row.stage}
                      className={cn("h-full", palette[idx % palette.length])}
                      style={{ width: `${width}%` }}
                      aria-hidden="true"
                    />
                  );
                })}
              </div>
              <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {data.guestPipelineBreakdown.map((row) => (
                  <li key={row.stage} className="flex items-center justify-between gap-2">
                    <span>{row.label}</span>
                    <span className="font-mono tabular-nums text-foreground">{row.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </StatusCard>

        <StatusCard title="Follow-up queue">
          {data.followUps.length === 0 ? (
            <EmptyState title="Nothing pending" description="Open follow-ups will surface here." />
          ) : (
            <ul className="space-y-2 text-sm">
              {data.followUps.slice(0, 5).map((item) => (
                <li key={item.id} className="rounded-md bg-background px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">{item.title}</span>
                    <span className="shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {followUpPriorityLabel(item.priority)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {followUpTypeLabel(item.type)}
                    {item.relatedGroupName ? ` · ${item.relatedGroupName}` : ""}
                    {item.dueDate ? ` · Due ${item.dueDate}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </StatusCard>

        <StatusCard title="Pipeline snapshot">
          {data.guestPipelineBreakdown.every((row) => row.count === 0) ? (
            <EmptyState
              title="No active pipeline data yet"
              description="Stage-by-stage totals will appear once guests are tracked."
            />
          ) : (
            <ul className="space-y-2 text-sm">
              {data.guestPipelineBreakdown
                .filter((row) => row.count > 0)
                .slice(0, 6)
                .map((row) => (
                  <li
                    key={row.stage}
                    className="flex items-center justify-between rounded-md bg-background px-3 py-2"
                  >
                    <span>{row.label}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {row.count} guest{row.count === 1 ? "" : "s"}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </StatusCard>
      </section>

      <section className="space-y-4">
        <SectionHeader
          title="Planned pauses and restart readiness"
          description="Lifecycle-focused oversight across all ministry groups."
        />
        <div className="surface-subtle p-4 text-sm text-muted-foreground">
          Groups marked{" "}
          <strong className="text-foreground">Planned Pause</strong>,{" "}
          <strong className="text-foreground">Seasonal Break</strong>, or{" "}
          <strong className="text-foreground">Overdue Restart</strong> stay visible in the
          group health list above, so restart planning never falls off the radar.
        </div>
      </section>
    </>
  );
}
