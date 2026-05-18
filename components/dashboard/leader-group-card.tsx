import { P, fontBody, fontDisplay, fontMono, fontSans } from "@/lib/pastoral";
import { PAvatar, PBadge } from "@/components/pastoral/atoms";
import { PButton } from "@/components/pastoral/button";
import { EmptyState, StatusCard } from "@/components/dashboard/cards";
import { HealthBadge, LifecycleBadge } from "@/components/dashboard/badges";
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

export function LeaderGroupCard({ dashboard }: { dashboard: LeaderGroupDashboard }) {
  const { group, recentSessions, healthPulse, followUps } = dashboard;
  const lifecycle = mapLifecycleToBadge(group.lifecycleStatus);
  const health = mapHealthToBadge(group.healthStatus);
  const checkInHelpId = `check-in-phase-help-${group.groupId}`;

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
            fontFamily: fontSans,
            fontSize: 10,
            letterSpacing: 2,
            textTransform: "uppercase",
            fontWeight: 600,
            opacity: 0.85,
            marginBottom: 8,
          }}
        >
          This week
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
          How did <span style={{ fontStyle: "italic" }}>tonight</span> go?
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
          Tap each person as you remember them. We&apos;ll save as you go.
        </div>
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
          aria-describedby={checkInHelpId}
        >
          Start check-in
        </PButton>
        <div
          id={checkInHelpId}
          style={{
            fontFamily: fontBody,
            fontSize: 12,
            fontStyle: "italic",
            opacity: 0.85,
            marginTop: 10,
          }}
        >
          Arrives with Phase 5B operational writes.
        </div>
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
                    Week of {session.meetingWeek}
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
            Tap arrives in Phase 5B
          </span>
        </div>
        {group.members.length === 0 ? (
          <EmptyState
            title="No active members yet"
            description="Add members in Supabase or via admin tools to populate this list."
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
                <div style={{ display: "flex", gap: 4 }}>
                  {(["P", "A", "E"] as const).map((letter) => (
                    <button
                      key={letter}
                      type="button"
                      disabled
                      aria-label={`Mark ${member.displayName} ${letter === "P" ? "present" : letter === "A" ? "absent" : "excused"} (arrives in Phase 5B)`}
                      title="Arrives in Phase 5B"
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 99,
                        display: "grid",
                        placeItems: "center",
                        fontSize: 12,
                        fontFamily: fontSans,
                        fontWeight: 600,
                        background: "transparent",
                        color: P.ink3,
                        border: `1px solid ${P.line}`,
                        cursor: "not-allowed",
                      }}
                    >
                      {letter}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
