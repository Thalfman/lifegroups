import type { ReactNode } from "react";
import { P, fontBody, fontDisplay, fontMono, fontSans } from "@/lib/pastoral";
import { PBadge } from "@/components/pastoral/atoms";
import { EmptyState, MetricCard, StatusCard } from "@/components/dashboard/cards";
import { HealthBadge, LifecycleBadge } from "@/components/dashboard/badges";
import { mapHealthToBadge, mapLifecycleToBadge } from "@/lib/dashboard/badge-map";
import {
  followUpPriorityLabel,
  followUpTypeLabel,
} from "@/lib/dashboard/labels";
import type { AdminDashboardData } from "@/lib/dashboard/types";

const PIPELINE_COLORS = [P.terra, P.mustard, P.sage, "#4f6e57"];

function priorityToTone(priority: string) {
  if (priority === "high") return "followup" as const;
  if (priority === "normal") return "watch" as const;
  return "neutral" as const;
}

function utilizationColor(pct: number | null): string {
  if (pct === null) return P.line;
  if (pct >= 1) return P.terra;
  if (pct >= 0.85) return P.mustard;
  return P.sage;
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <th
      style={{
        textAlign: "left",
        padding: "6px 0",
        fontFamily: fontSans,
        color: P.ink3,
        fontSize: 10,
        letterSpacing: 1.3,
        textTransform: "uppercase",
        fontWeight: 600,
        borderBottom: `1px solid ${P.line2}`,
      }}
    >
      {children}
    </th>
  );
}

export function AdminDashboard({ data }: { data: AdminDashboardData }) {
  const totalPipeline = data.guestPipelineBreakdown.reduce(
    (sum, row) => sum + row.count,
    0,
  );

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section aria-labelledby="weekly-overview">
        <h2 id="weekly-overview" className="sr-only">
          Weekly overview
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 14,
          }}
        >
          <MetricCard
            title="Active groups"
            value={String(data.activeGroupCount)}
            meta={`${data.capacity.nearCapacityGroups} near capacity, ${data.capacity.fullGroups} full`}
            accent={P.sage}
          />
          <MetricCard
            title="Attendance"
            value={String(data.attendanceThisWeek)}
            meta={`Present check-ins · ${data.weekLabel}`}
            accent={P.terra}
          />
          <MetricCard
            title="Guests in pipeline"
            value={String(data.guestPipelineCount)}
            meta={`${totalPipeline} guest${totalPipeline === 1 ? "" : "s"} tracked across all stages`}
            accent={P.mustard}
          />
          <MetricCard
            title="Missing check-ins"
            value={String(data.missingCheckInsCount)}
            meta="Sessions not yet submitted for the latest week"
            accent={P.ink}
            valueColor={P.ink}
          />
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1fr)",
          gap: 18,
        }}
      >
        <StatusCard
          title="Group health"
          eyebrow="Active groups"
          action="See all"
        >
          {data.groupHealth.length === 0 ? (
            <EmptyState
              title="No groups yet"
              description="Group health rows will appear here once groups exist."
            />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  fontSize: 13.5,
                  borderCollapse: "collapse",
                  fontFamily: fontBody,
                  color: P.ink,
                }}
              >
                <thead>
                  <tr>
                    <SectionLabel>Group</SectionLabel>
                    <SectionLabel>Lifecycle</SectionLabel>
                    <SectionLabel>Health</SectionLabel>
                  </tr>
                </thead>
                <tbody>
                  {data.groupHealth.map((row) => {
                    const lifecycle = mapLifecycleToBadge(row.lifecycleStatus);
                    const health = mapHealthToBadge(row.healthStatus);
                    return (
                      <tr
                        key={row.groupId}
                        style={{ borderBottom: `1px solid ${P.line2}` }}
                      >
                        <td
                          style={{
                            padding: "13px 0",
                            fontFamily: fontDisplay,
                            fontSize: 15,
                            fontWeight: 600,
                          }}
                        >
                          {row.name}
                        </td>
                        <td style={{ padding: "13px 0" }}>
                          <LifecycleBadge {...lifecycle} />
                        </td>
                        <td style={{ padding: "13px 0" }}>
                          <HealthBadge {...health} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </StatusCard>

        <StatusCard title="Near capacity" eyebrow="Active groups">
          {data.capacity.rows.length === 0 ? (
            <EmptyState
              title="No active groups yet"
              description="Capacity usage will appear here once groups exist."
            />
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              <p
                style={{
                  fontFamily: fontBody,
                  fontSize: 13,
                  color: P.ink2,
                  margin: 0,
                  fontStyle: "italic",
                }}
              >
                <strong style={{ color: P.terra, fontStyle: "normal" }}>
                  {data.capacity.fullGroups}
                </strong>{" "}
                full ·{" "}
                <strong style={{ color: P.mustard, fontStyle: "normal" }}>
                  {data.capacity.nearCapacityGroups}
                </strong>{" "}
                near capacity
              </p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12 }}>
                {data.capacity.rows.slice(0, 5).map((row) => {
                  const pct =
                    row.utilization === null
                      ? null
                      : Math.min(1, Math.max(0, row.utilization));
                  const color = utilizationColor(pct);
                  const pctLabel =
                    pct === null ? "capacity unknown" : `${Math.round(pct * 100)}%`;
                  const ariaLabel = `${row.name}: ${row.activeMembers}${row.capacity ? ` of ${row.capacity}` : ""} active members (${pctLabel})`;
                  return (
                    <li key={row.groupId}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontFamily: fontBody,
                          fontSize: 13,
                          marginBottom: 5,
                        }}
                      >
                        <span>{row.name}</span>
                        <span
                          style={{
                            fontFamily: fontMono,
                            fontSize: 11,
                            color: P.ink2,
                          }}
                        >
                          {row.activeMembers}
                          {row.capacity ? ` / ${row.capacity}` : ""}
                        </span>
                      </div>
                      <div
                        role="img"
                        aria-label={ariaLabel}
                        style={{
                          height: 6,
                          borderRadius: 99,
                          background: P.line2,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          aria-hidden="true"
                          style={{
                            height: "100%",
                            width: pct === null ? "10%" : `${Math.round(pct * 100)}%`,
                            background: color,
                            borderRadius: 99,
                          }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </StatusCard>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)",
          gap: 18,
        }}
      >
        <StatusCard
          title="Guest pipeline"
          eyebrow="From the front door to a seat at the table"
          action={`${totalPipeline} in flight`}
        >
          {totalPipeline === 0 ? (
            <EmptyState
              title="No guests yet"
              description="Guests added in Supabase will appear in this pipeline."
            />
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              <div
                role="img"
                aria-label={`Guest pipeline: ${totalPipeline} guest${totalPipeline === 1 ? "" : "s"} tracked.`}
                style={{
                  display: "flex",
                  height: 12,
                  width: "100%",
                  overflow: "hidden",
                  borderRadius: 99,
                  background: P.line2,
                }}
              >
                {data.guestPipelineBreakdown.map((row, idx) => {
                  if (row.count === 0) return null;
                  const width = (row.count / totalPipeline) * 100;
                  return (
                    <div
                      key={row.stage}
                      aria-hidden="true"
                      style={{
                        height: "100%",
                        width: `${width}%`,
                        background: PIPELINE_COLORS[idx % PIPELINE_COLORS.length],
                      }}
                    />
                  );
                })}
              </div>
              <ul
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: 12,
                  listStyle: "none",
                  padding: 0,
                  margin: 0,
                }}
              >
                {data.guestPipelineBreakdown.map((row, idx) => (
                  <li
                    key={row.stage}
                    style={{
                      borderTop: `2px solid ${PIPELINE_COLORS[idx % PIPELINE_COLORS.length]}`,
                      paddingTop: 10,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: fontSans,
                        fontSize: 10,
                        letterSpacing: 1.2,
                        textTransform: "uppercase",
                        color: P.ink3,
                        fontWeight: 600,
                      }}
                    >
                      {row.label}
                    </div>
                    <div
                      style={{
                        fontFamily: fontDisplay,
                        fontSize: 30,
                        fontWeight: 500,
                        letterSpacing: -1,
                        color: PIPELINE_COLORS[idx % PIPELINE_COLORS.length],
                        lineHeight: 1,
                        marginTop: 4,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {row.count}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </StatusCard>

        <StatusCard title="Follow-ups" action="View all">
          {data.followUps.length === 0 ? (
            <EmptyState
              title="Nothing pending"
              description="Open follow-ups will surface here."
            />
          ) : (
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
              }}
            >
              {data.followUps.slice(0, 5).map((item, idx, arr) => (
                <li
                  key={item.id}
                  style={{
                    padding: "12px 0",
                    borderBottom: idx < arr.length - 1 ? `1px solid ${P.line2}` : "none",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      alignItems: "flex-start",
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: fontBody,
                        fontSize: 14,
                        fontWeight: 500,
                        color: P.ink,
                      }}
                    >
                      {item.title}
                    </span>
                    <PBadge tone={priorityToTone(item.priority)}>
                      {followUpPriorityLabel(item.priority)}
                    </PBadge>
                  </div>
                  <div
                    style={{
                      fontFamily: fontBody,
                      fontSize: 12,
                      color: P.ink2,
                      fontStyle: "italic",
                    }}
                  >
                    {followUpTypeLabel(item.type)}
                    {item.relatedGroupName ? ` · ${item.relatedGroupName}` : ""}
                    {item.dueDate ? ` · Due ${item.dueDate}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </StatusCard>
      </section>

      <section>
        <StatusCard
          title="Planned pauses and restart readiness"
          eyebrow="Lifecycle oversight"
        >
          <p
            style={{
              fontFamily: fontBody,
              fontSize: 14,
              color: P.ink2,
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            Groups marked{" "}
            <strong style={{ color: P.ink, fontWeight: 600 }}>Planned Pause</strong>,{" "}
            <strong style={{ color: P.ink, fontWeight: 600 }}>Seasonal Break</strong>,
            or{" "}
            <strong style={{ color: P.ink, fontWeight: 600 }}>Overdue Restart</strong>{" "}
            stay visible in the group health list above, so restart planning never
            falls off the radar.
          </p>
        </StatusCard>
      </section>
    </div>
  );
}
