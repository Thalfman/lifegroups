"use client";

import { useMemo, useState } from "react";
import { SectionHeader } from "@/components/layout/shell";
import { PeopleDirectory } from "@/components/admin/people-directory";
import { GroupAssignmentsManager } from "@/components/admin/group-assignments-manager";
import { LeaderProfileForm } from "@/components/admin/forms/leader-profile-form";
import { MemberForm } from "@/components/admin/forms/member-form";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";
import type {
  GroupLeadersRow,
  GroupMembershipsRow,
  GroupsRow,
  MembersRow,
  ProfilesRow,
} from "@/types/database";

export type PeopleManagementData = {
  currentActorProfileId: string;
  profiles: ProfilesRow[];
  members: MembersRow[];
  groups: GroupsRow[];
  groupLeaders: GroupLeadersRow[];
  memberships: GroupMembershipsRow[];
  errors: {
    profiles: string | null;
    members: string | null;
    groups: string | null;
    leaders: string | null;
    memberships: string | null;
  };
};

// People is the most entangled admin surface (identity, directory, assignments,
// groups, permissions), so the Editing Pattern is applied here last (#270,
// Admin Interaction Model req 3). Rather than stacking the directory, the
// add-person forms, and every group's assignment forms on one long page, the
// three workflows are now distinct views: People defaults to the Directory, and
// Add person / Assignments are secondary views reached by explicit actions. A
// no-results directory search no longer leaves a large unrelated section (e.g.
// Assignments) visible below it, because those views are not in the DOM until
// chosen. No data-model or permission changes — only the layout/navigation.
type PeopleView = "directory" | "add" | "assignments";

const VIEWS: { value: PeopleView; label: string }[] = [
  { value: "directory", label: "Directory" },
  { value: "add", label: "Add person" },
  { value: "assignments", label: "Assignments" },
];

export function PeopleManagementShell({
  data,
}: {
  data: PeopleManagementData;
}) {
  const [view, setView] = useState<PeopleView>("directory");

  const profilesById = useMemo(
    () => new Map(data.profiles.map((p) => [p.id, p])),
    [data.profiles]
  );
  const membersById = useMemo(
    () => new Map(data.members.map((m) => [m.id, m])),
    [data.members]
  );

  const leaderOptions = useMemo(
    () =>
      data.profiles
        .filter(
          (p) =>
            (p.role === "leader" || p.role === "co_leader") &&
            p.status === "active"
        )
        .map((p) => ({
          id: p.id,
          label: `${p.full_name} (${ROLE_LABELS[p.role]})`,
        })),
    [data.profiles]
  );

  const memberOptions = useMemo(
    () =>
      data.members
        .filter((m) => m.status === "active")
        .map((m) => ({ id: m.id, label: m.full_name })),
    [data.members]
  );

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <ViewNav view={view} onChange={setView} />

      {view === "directory" ? (
        <PeopleDirectory
          profiles={data.profiles}
          members={data.members}
          groups={data.groups}
          groupLeaders={data.groupLeaders}
          memberships={data.memberships}
          currentActorProfileId={data.currentActorProfileId}
          errors={{
            profiles: data.errors.profiles,
            members: data.errors.members,
            leaders: data.errors.leaders,
            memberships: data.errors.memberships,
          }}
        />
      ) : null}

      {view === "add" ? (
        <section style={{ display: "grid", gap: 18 }}>
          <SectionHeader
            eyebrow="Add new"
            title="Add a leader or a member"
            description="Leader profiles get a sign-in. Members are participant records only — they don't sign in. Use the Assignments view to place them in a group."
          />
          <div
            className="lg-m-grid-stack"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 16,
            }}
          >
            <Card>
              <CardHeader
                title="Add leader profile"
                caption="Creates a sign-in profile."
              />
              <LeaderProfileForm />
            </Card>
            <Card>
              <CardHeader
                title="Add member"
                caption="Non-login participant record. Email is optional."
              />
              <MemberForm />
            </Card>
          </div>
        </section>
      ) : null}

      {view === "assignments" ? (
        <GroupAssignmentsManager
          groups={data.groups}
          groupLeaders={data.groupLeaders}
          memberships={data.memberships}
          profilesById={profilesById}
          membersById={membersById}
          leaderOptions={leaderOptions}
          memberOptions={memberOptions}
          groupsError={data.errors.groups}
          leadersError={data.errors.leaders}
          membershipsError={data.errors.memberships}
        />
      ) : null}
    </div>
  );
}

// Segmented control switching the three People workflows. Toggle buttons (each
// carrying aria-pressed) rather than a single live region so a screen-reader
// user hears which view is active and that the others are selectable.
function ViewNav({
  view,
  onChange,
}: {
  view: PeopleView;
  onChange: (next: PeopleView) => void;
}) {
  return (
    <nav
      aria-label="People views"
      style={{
        display: "inline-flex",
        gap: 4,
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 999,
        padding: 4,
        flexWrap: "wrap",
        width: "fit-content",
      }}
    >
      {VIEWS.map((v) => {
        const active = v.value === view;
        return (
          <button
            key={v.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(v.value)}
            style={{
              fontFamily: fontSans,
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: 0.2,
              padding: "8px 16px",
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
              background: active ? P.ink : "transparent",
              color: active ? P.bg : P.ink2,
            }}
          >
            {v.label}
          </button>
        );
      })}
    </nav>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 10,
        padding: "18px 22px",
      }}
    >
      {children}
    </div>
  );
}

function CardHeader({ title, caption }: { title: string; caption: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          fontFamily: fontDisplay,
          fontSize: 17,
          color: P.ink,
          fontWeight: 500,
        }}
      >
        {title}
      </div>
      <p
        style={{
          fontFamily: fontBody,
          fontSize: 12,
          color: P.ink3,
          margin: "2px 0 0",
          letterSpacing: 0.1,
        }}
      >
        <span style={{ fontFamily: fontSans }}>{caption}</span>
      </p>
    </div>
  );
}
