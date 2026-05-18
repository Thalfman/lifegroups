import Link from "next/link";
import { P, fontBody, fontDisplay, fontMono, fontSans } from "@/lib/pastoral";
import { PAvatar, PBadge } from "@/components/pastoral/atoms";
import { PButton } from "@/components/pastoral/button";
import { EmptyState, StatusCard } from "@/components/dashboard/cards";
import { HealthBadge, LifecycleBadge } from "@/components/dashboard/badges";
import { LeaderQuickDidNotMeet } from "@/components/leader/quick-did-not-meet";
import { mapHealthToBadge, mapLifecycleToBadge } from "@/lib/dashboard/badge-map";
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
  preview = false,
}: {
  dashboard: LeaderGroupDashboard;
  preview?: boolean;
}) {
  const { group, recentSessions, healthPulse, followUps, currentWeek } = dashboard;
  const lifecycle = mapLifecycleToBadge(group.lifecycleStatus);
  const health = mapHealthToBadge(group.healthStatus);
  const closed = group.lifecycleStatus === "closed";
  const submitted = currentWeek.alreadySubmitted;
  const checkinHref = `/leader/${group.groupId}/checkin`;
  const ctaLabel = submitted ? "Update check-in" : "Start check-in";
  const heroEyebrow = submitted ? "Saved for this week" : "This week";
  const heroTitle = submitted ? (
    <>
      Anything to <span style={{ fontStyle: "italic" }}>add?</span>
    </>
  ) : (
    <>
      How did <span style={{ fontStyle: "italic" }}>tonight</span> go?
    </>
  );
  const heroLede = submitted
    ? "You can update tonight's check-in any time. We'll keep the record fresh."
    : "Tap each person as you remember them. We'll save it when you submit.";

  return (
    <section
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 18,
        padding: 28,
        display: "grid",
        gap: 18,
      }}
    >
      <header
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: fontSans,
              fontSize: 10,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: P.ink3,
              fontWeight: 600,
              marginBottom: 6,
            }}
          >
            {group.weekLabel}
          </div>
          <h2
            style={{
              fontFamily: fontDisplay,
              fontSize: "clamp(28px, 4vw, 36px)",
              margin: 0,
              fontWeight: 500,
              letterSpacing: -1,
              lineHeight: 1.05,
              color: P.ink,
            }}
          >
            {group.name}
          </h2>
          <div
            style={{
              fontFamily: fontBody,
              fontSize: 14,
              color: P.ink2,
              fontStyle: "italic",
              marginTop: 6,
            }}
          >
            {group.meetingDay ?? "TBD"}
            {group.meetingTime ? ` · ${group.meetingTime}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <LifecycleBadge {...lifecycle} />
          <HealthBadge {...health} />
        </div>
      </header>

      <div
        style={{
          background: P.terra,
          color: P.surface,
          borderRadius: 18,
          padding: "22px 24px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: -30,
            right: -30,
            width: 120,
            height: 120,
            borderRadius: 999,
            background: "rgba(255,255,255,0.06)",
          }}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 8,
          }}
        >
          <div
            style={{
              fontFamily: fontSans,
              fontSize: 10,
              letterSpacing: 2,
              textTransform: "uppercase",
              fontWeight: 600,
              opacity: 0.85,
            }}
          >
            {heroEyebrow}
          </div>
          {submitted ? (
            <span
              style={{
                fontFamily: fontSans,
                fontSize: 11,
                letterSpacing: 1.5,
                textTransform: "uppercase",
                fontWeight: 600,
                background: "rgba(255,255,255,0.18)",
                padding: "3px 10px",
                borderRadius: 999,
              }}
            >
              {sessionStatusLabel(currentWeek.status)}
            </span>
          ) : null}
        </div>
        <div
          style={{
            fontFamily: fontDisplay,
            fontSize: 26,
            fontWeight: 500,
            letterSpacing: -0.5,
            lineHeight: 1.15,
            marginBottom: 6,
          }}
        >
          {heroTitle}
        </div>
        <div
          style={{
            fontFamily: fontBody,
            fontSize: 14,
            opacity: 0.9,
            lineHeight: 1.55,
            marginBottom: 18,
          }}
        >
          {heroLede}
        </div>
        {submitted && currentWeek.status === "submitted" ? (
          <div
            style={{
              fontFamily: fontMono,
              fontSize: 12.5,
              opacity: 0.9,
              marginBottom: 14,
            }}
          >
            {currentWeek.presentCount}P · {currentWeek.absentCount}A ·{" "}
            {currentWeek.excusedCount}E
            {currentWeek.meetingDate ? ` · ${currentWeek.meetingDate}` : ""}
          </div>
        ) : null}
        {closed ? (
          <div
            style={{
              fontFamily: fontBody,
              fontSize: 13,
              fontStyle: "italic",
              opacity: 0.85,
              padding: "10px 14px",
              background: "rgba(255,255,255,0.12)",
              borderRadius: 10,
            }}
          >
            This group is closed. Check-ins are turned off; ask an admin to
            reopen it if it should be active again.
          </div>
        ) : preview ? (
          <PButton
            tone="ghost"
            disabled
            style={{
              background: P.surface,
              color: P.terra,
              border: "none",
              width: "100%",
              fontWeight: 600,
              opacity: 0.95,
            }}
            title="Preview — sign in as a leader to start a real check-in."
          >
            {ctaLabel}
          </PButton>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            <Link
              href={checkinHref}
              style={{
                background: P.surface,
                color: P.terra,
                borderRadius: 999,
                padding: "12px 18px",
                fontFamily: fontSans,
                fontSize: 14,
                fontWeight: 600,
                textAlign: "center",
                textDecoration: "none",
                display: "block",
              }}
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 16,
        }}
      >
        <StatusCard title="A quick pulse" eyebrow="Group">
          {(
            [
              ["Rhythm", healthPulse.attendanceRhythm],
              [
                "New guests",
                `${healthPulse.newGuestsThisWeek} this week`,
              ],
              [
                "Members",
                `${group.activeMembers}${group.capacity ? ` of ${group.capacity}` : ""} active`,
              ],
            ] as const
          ).map(([k, v], i, arr) => (
            <div
              key={k}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                padding: "10px 0",
                borderBottom:
                  i < arr.length - 1 ? `1px solid ${P.line2}` : "none",
              }}
            >
              <span
                style={{
                  fontFamily: fontBody,
                  fontSize: 13.5,
                  color: P.ink2,
                  fontStyle: "italic",
                }}
              >
                {k}
              </span>
              <span
                style={{
                  fontFamily: fontBody,
                  fontSize: 13.5,
                  fontWeight: 500,
                  color: P.ink,
                  textAlign: "right",
                }}
              >
                {v}
              </span>
            </div>
          ))}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
              paddingTop: 10,
              marginTop: 4,
            }}
          >
            <span
              style={{
                fontFamily: fontBody,
                fontSize: 13.5,
                color: P.ink2,
                fontStyle: "italic",
              }}
            >
              Current health
            </span>
            <HealthBadge {...mapHealthToBadge(healthPulse.currentHealth)} />
          </div>
          {healthPulse.leaderNote ? (
            <div
              style={{
                background: P.bg,
                borderRadius: 10,
                padding: "14px 16px",
                marginTop: 14,
                fontFamily: fontBody,
                fontSize: 14,
                fontStyle: "italic",
                color: P.ink,
                lineHeight: 1.5,
                borderLeft: `3px solid ${P.terra}`,
              }}
            >
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
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: 0,
              }}
            >
              {recentSessions.map((session, i, arr) => (
                <li
                  key={session.meetingWeek}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: "4px 12px",
                    padding: "11px 0",
                    borderBottom:
                      i < arr.length - 1 ? `1px solid ${P.line2}` : "none",
                  }}
                >
                  <span
                    style={{
                      fontFamily: fontBody,
                      fontSize: 13.5,
                      color: P.ink,
                    }}
                  >
                    Week of {describeWeek(session.meetingWeek)}
                  </span>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "baseline",
                      gap: 8,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: fontBody,
                        fontSize: 12.5,
                        color: P.ink2,
                        fontStyle: "italic",
                      }}
                    >
                      {sessionStatusLabel(session.status)}
                    </span>
                    <span
                      style={{
                        fontFamily: fontMono,
                        fontSize: 11.5,
                        color: P.ink2,
                      }}
                    >
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
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {followUps.map((item, i, arr) => (
                <li
                  key={item.id}
                  style={{
                    padding: "11px 0",
                    borderBottom:
                      i < arr.length - 1 ? `1px solid ${P.line2}` : "none",
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
                    {item.dueDate ? ` · Due ${item.dueDate}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </StatusCard>
      </div>

      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 12,
            marginBottom: 12,
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
                marginBottom: 4,
              }}
            >
              Roster
            </div>
            <div
              style={{
                fontFamily: fontDisplay,
                fontSize: 18,
                fontWeight: 600,
                letterSpacing: -0.2,
                color: P.ink,
              }}
            >
              The people of {group.name}
            </div>
          </div>
          <span
            style={{
              fontFamily: fontSans,
              fontSize: 10.5,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: P.ink3,
              fontWeight: 600,
            }}
          >
            Tap each person inside the check-in
          </span>
        </div>
        {group.members.length === 0 ? (
          <EmptyState
            title="No active members yet"
            description="Ask an admin to add members in the people screen, or submit 'Group did not meet' if there's no roster to mark."
          />
        ) : (
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              background: P.bg,
              border: `1px solid ${P.line2}`,
              borderRadius: 14,
              overflow: "hidden",
            }}
          >
            {group.members.map((member, i, arr) => (
              <li
                key={member.id}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 12,
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 18px",
                  borderBottom:
                    i < arr.length - 1 ? `1px solid ${P.line2}` : "none",
                  background: P.surface,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    minWidth: 0,
                  }}
                >
                  <PAvatar name={member.displayName} size={32} tone="terra" />
                  <span
                    style={{
                      fontFamily: fontBody,
                      fontSize: 14.5,
                      fontWeight: 500,
                      color: P.ink,
                    }}
                  >
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
