import { SectionHeader } from "@/components/layout/shell";
import { AssignLeaderForm } from "@/components/admin/forms/assign-leader-form";
import { AssignMemberForm } from "@/components/admin/forms/assign-member-form";
import { PBadge } from "@/components/pastoral/atoms";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";
import type {
  GroupLeadersRow,
  GroupMembershipsRow,
  GroupsRow,
  MembersRow,
  ProfilesRow,
} from "@/types/database";

export function GroupAssignmentsSection({
  groups,
  groupLeaders,
  memberships,
  profilesById,
  membersById,
  leaderOptions,
  memberOptions,
  groupsError,
  leadersError,
  membershipsError,
}: {
  groups: GroupsRow[];
  groupLeaders: GroupLeadersRow[];
  memberships: GroupMembershipsRow[];
  profilesById: Map<string, ProfilesRow>;
  membersById: Map<string, MembersRow>;
  leaderOptions: { id: string; label: string }[];
  memberOptions: { id: string; label: string }[];
  groupsError: string | null;
  leadersError: string | null;
  membershipsError: string | null;
}) {
  return (
    <section style={{ display: "grid", gap: 18 }}>
      <SectionHeader
        eyebrow="Groups"
        title="Assignments"
        description="Place leaders and members into their Life Group. Leaders sign in; members are tracked through the directory above."
      />

      {groupsError ? (
        <ErrorBanner>Couldn&rsquo;t load groups: {groupsError}</ErrorBanner>
      ) : groups.length === 0 ? (
        <Empty
          title="No groups yet"
          description="Groups are seeded into the database directly. Once a group exists, it&rsquo;ll appear here ready for assignments."
        />
      ) : (
        <div style={{ display: "grid", gap: 18 }}>
          {groups.map((group) => {
            const activeLeaders = groupLeaders.filter(
              (gl) => gl.group_id === group.id && gl.active,
            );
            const activeMemberships = memberships.filter(
              (gm) => gm.group_id === group.id && gm.status === "active",
            );
            return (
              <article
                key={group.id}
                style={{
                  background: P.surface,
                  border: `1px solid ${P.line}`,
                  borderRadius: 12,
                  padding: "20px 22px",
                  display: "grid",
                  gap: 16,
                }}
              >
                <header
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <h3
                      style={{
                        margin: 0,
                        fontFamily: fontDisplay,
                        fontSize: 20,
                        fontWeight: 500,
                        color: P.ink,
                        letterSpacing: -0.3,
                      }}
                    >
                      {group.name}
                    </h3>
                    {group.location_area || group.meeting_day ? (
                      <div
                        style={{
                          fontFamily: fontBody,
                          fontSize: 13,
                          color: P.ink3,
                          marginTop: 4,
                        }}
                      >
                        {[group.location_area, group.meeting_day]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    ) : null}
                  </div>
                  <PBadge tone="neutral">{group.lifecycle_status.replace(/_/g, " ")}</PBadge>
                </header>

                <div style={twoColumnStyle}>
                  <Subsection title={`Leaders (${activeLeaders.length})`}>
                    {leadersError ? (
                      <SoftError>Couldn&rsquo;t load leader assignments.</SoftError>
                    ) : activeLeaders.length === 0 ? (
                      <SoftEmpty>No leaders assigned yet.</SoftEmpty>
                    ) : (
                      <ul style={pillListStyle}>
                        {activeLeaders.map((gl) => {
                          const profile = profilesById.get(gl.profile_id);
                          return (
                            <li
                              key={gl.id}
                              style={{
                                ...pillStyle,
                                background: P.sageSoft,
                                color: "#3e4f29",
                              }}
                            >
                              {profile?.full_name ?? "Unknown leader"}
                              <span
                                style={{
                                  fontSize: 10,
                                  letterSpacing: 0.6,
                                  textTransform: "uppercase",
                                  opacity: 0.75,
                                  marginLeft: 6,
                                }}
                              >
                                {gl.role.replace("_", "-")}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <AssignLeaderForm groupId={group.id} leaderOptions={leaderOptions} />
                  </Subsection>

                  <Subsection title={`Members (${activeMemberships.length})`}>
                    {membershipsError ? (
                      <SoftError>Couldn&rsquo;t load memberships.</SoftError>
                    ) : activeMemberships.length === 0 ? (
                      <SoftEmpty>No members in this group yet.</SoftEmpty>
                    ) : (
                      <ul style={pillListStyle}>
                        {activeMemberships.map((gm) => {
                          const member = membersById.get(gm.member_id);
                          return (
                            <li
                              key={gm.id}
                              style={{
                                ...pillStyle,
                                background: P.line2,
                                color: P.ink2,
                              }}
                            >
                              {member?.full_name ?? "Unknown member"}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <AssignMemberForm groupId={group.id} memberOptions={memberOptions} />
                  </Subsection>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

const twoColumnStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 18,
} as const;

const pillListStyle = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "flex",
  flexWrap: "wrap" as const,
  gap: 6,
};

const pillStyle = {
  fontFamily: fontSans,
  fontSize: 12,
  padding: "4px 10px",
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
} as const;

function Subsection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <h4
        style={{
          margin: 0,
          fontFamily: fontSans,
          fontSize: 11,
          letterSpacing: 1.4,
          textTransform: "uppercase",
          color: P.ink3,
          fontWeight: 600,
        }}
      >
        {title}
      </h4>
      {children}
    </div>
  );
}

function SoftEmpty({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        margin: 0,
        fontFamily: fontBody,
        fontSize: 13,
        color: P.ink3,
        fontStyle: "italic",
      }}
    >
      {children}
    </p>
  );
}

function SoftError({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        margin: 0,
        fontFamily: fontBody,
        fontSize: 13,
        color: "#7d3621",
      }}
    >
      {children}
    </p>
  );
}

function Empty({ title, description }: { title: string; description: string }) {
  return (
    <div
      style={{
        background: P.surface,
        border: `1px dashed ${P.line}`,
        borderRadius: 10,
        padding: "22px 24px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: fontDisplay,
          fontSize: 16,
          color: P.ink,
          fontWeight: 500,
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <p
        style={{
          fontFamily: fontBody,
          fontSize: 13,
          color: P.ink2,
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        {description}
      </p>
    </div>
  );
}

function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <div
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
