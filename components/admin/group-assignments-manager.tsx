"use client";

import { SectionHeader } from "@/components/layout/shell";
import { EditingSurface } from "@/components/lg/admin/editing-surface";
import { useEditingDrawer } from "@/components/lg/admin/use-editing-drawer";
import { AssignLeaderForm } from "@/components/admin/forms/assign-leader-form";
import { AssignMemberForm } from "@/components/admin/forms/assign-member-form";
import { PButton } from "@/components/pastoral/button";
import { PBadge } from "@/components/pastoral/atoms";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";
import type {
  GroupLeadersRow,
  GroupMembershipsRow,
  GroupsRow,
  MembersRow,
  ProfilesRow,
} from "@/types/database";

// Group assignments, moved out of the always-rendered inline-per-group layout
// into the Editing Pattern (#270, Admin Interaction Model req 3). Previously the
// People page stacked a full assign-leader + assign-member form under every
// group at once; the assignment workflow now lives in a detail surface (the
// shared EditingSurface drawer — a sanctioned Editing-Pattern choice for the
// complex People assignment workflow) opened per group. The list itself is a
// read-only roster: each row shows the current leaders/members and a single
// "Edit assignments for {group}" control, so repeated actions carry record
// context and a screen-reader user is never faced with a wall of identical
// "Assign" controls.
//
// No data-model or permission changes: the same server actions back the same
// forms; only where they render changed.
export function GroupAssignmentsManager({
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
  // A per-group drawer (target = the group id being edited). Assignments are
  // additive: the drawer stays open after each save so several people can be
  // placed in a row, and the assign server actions revalidate /admin/people
  // themselves, so the roster behind the open drawer refreshes without a
  // client router.refresh. `markSaved` (wired to each form's onSaved) clears the
  // dirty flag once a write lands, so closing right after a successful assign
  // never falsely warns about unsaved changes.
  const drawer = useEditingDrawer<string>({
    closeOnSave: false,
    refreshOnSave: false,
  });

  const selectedGroup =
    drawer.target === null
      ? null
      : (groups.find((g) => g.id === drawer.target) ?? null);

  const leadersFor = (groupId: string) =>
    groupLeaders.filter((gl) => gl.group_id === groupId && gl.active);
  const membersFor = (groupId: string) =>
    memberships.filter(
      (gm) => gm.group_id === groupId && gm.status === "active"
    );

  return (
    <section style={{ display: "grid", gap: 18 }}>
      <SectionHeader
        eyebrow="Groups"
        title="Assignments"
        description="Place leaders and members into their Life Group. Open a group to edit its roster — leaders sign in; members are tracked through the directory."
      />

      {groupsError ? (
        <ErrorBanner>Couldn&rsquo;t load groups: {groupsError}</ErrorBanner>
      ) : groups.length === 0 ? (
        <Empty
          title="No groups yet"
          description="Groups are seeded into the database directly. Once a group exists, it&rsquo;ll appear here ready for assignments."
        />
      ) : (
        <ul style={listResetStyle}>
          {groups.map((group) => {
            const activeLeaders = leadersFor(group.id);
            const activeMemberships = membersFor(group.id);
            return (
              <li
                key={group.id}
                style={{
                  background: P.surface,
                  border: `1px solid ${P.line}`,
                  borderRadius: 12,
                  padding: "18px 20px",
                  marginBottom: 12,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 16,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ minWidth: 0, display: "grid", gap: 8 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <h3
                      style={{
                        margin: 0,
                        fontFamily: fontDisplay,
                        fontSize: 19,
                        fontWeight: 500,
                        color: P.ink,
                        letterSpacing: -0.3,
                      }}
                    >
                      {group.name}
                    </h3>
                    {group.location_area || group.meeting_day ? (
                      <span
                        style={{
                          fontFamily: fontBody,
                          fontSize: 13,
                          color: P.ink3,
                        }}
                      >
                        {[group.location_area, group.meeting_day]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    ) : null}
                    <PBadge tone="neutral">
                      {group.lifecycle_status.replace(/_/g, " ")}
                    </PBadge>
                  </div>
                  <div
                    style={{
                      fontFamily: fontSans,
                      fontSize: 12,
                      color: P.ink2,
                      display: "flex",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <span>
                      {leadersError
                        ? "Leaders: —"
                        : `${activeLeaders.length} leader${activeLeaders.length === 1 ? "" : "s"}`}
                    </span>
                    <span>
                      {membershipsError
                        ? "Members: —"
                        : `${activeMemberships.length} member${activeMemberships.length === 1 ? "" : "s"}`}
                    </span>
                  </div>
                </div>
                <PButton
                  type="button"
                  tone="ghost"
                  size="sm"
                  onClick={() => drawer.open(group.id)}
                  aria-label={`Edit assignments for ${group.name}${
                    group.location_area ? ` (${group.location_area})` : ""
                  }`}
                >
                  Edit assignments
                </PButton>
              </li>
            );
          })}
        </ul>
      )}

      {/* One always-mounted drawer (open toggled) so Radix owns the focus trap
          and focus restore. The selected group's roster + assign forms render
          here, out of the list flow. */}
      <EditingSurface
        open={selectedGroup !== null}
        onRequestClose={drawer.requestClose}
        eyebrow="Assignments"
        title={selectedGroup ? selectedGroup.name : "Assignments"}
        description="Add leaders and members to this group. Each assignment saves on its own; close when you're done."
        closeLabel={
          selectedGroup
            ? `Close assignments for ${selectedGroup.name}`
            : "Close assignments"
        }
      >
        {selectedGroup ? (
          // onChange bubbles from the selects, so the drawer can warn before
          // discarding a half-made selection without the forms needing to know
          // about the drawer.
          <div onChange={drawer.markDirty} style={{ display: "grid", gap: 22 }}>
            <Subsection
              title={`Leaders (${leadersFor(selectedGroup.id).length})`}
            >
              {leadersError ? (
                <SoftError>Couldn&rsquo;t load leader assignments.</SoftError>
              ) : leadersFor(selectedGroup.id).length === 0 ? (
                <SoftEmpty>No leaders assigned yet.</SoftEmpty>
              ) : (
                <ul style={pillListStyle}>
                  {leadersFor(selectedGroup.id).map((gl) => {
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
              <AssignLeaderForm
                groupId={selectedGroup.id}
                leaderOptions={leaderOptions}
                onSaved={drawer.markSaved}
                onPendingChange={drawer.reportPending}
              />
            </Subsection>

            <Subsection
              title={`Members (${membersFor(selectedGroup.id).length})`}
            >
              {membershipsError ? (
                <SoftError>Couldn&rsquo;t load memberships.</SoftError>
              ) : membersFor(selectedGroup.id).length === 0 ? (
                <SoftEmpty>No members in this group yet.</SoftEmpty>
              ) : (
                <ul style={pillListStyle}>
                  {membersFor(selectedGroup.id).map((gm) => {
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
              <AssignMemberForm
                groupId={selectedGroup.id}
                memberOptions={memberOptions}
                onSaved={drawer.markSaved}
                onPendingChange={drawer.reportPending}
              />
            </Subsection>
          </div>
        ) : null}
      </EditingSurface>
      {drawer.discardDialog}
    </section>
  );
}

const listResetStyle = { listStyle: "none", padding: 0, margin: 0 } as const;

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

function Subsection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
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
