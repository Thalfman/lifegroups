"use client";

import { useMemo, useState } from "react";
import { SectionHeader } from "@/components/layout/shell";
import { PeopleDirectory } from "@/components/admin/people-directory";
import { LeaderProfileForm } from "@/components/admin/forms/leader-profile-form";
import { MemberForm } from "@/components/admin/forms/member-form";
import { LeaderPipeline } from "@/components/admin/leader-pipeline/leader-pipeline";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";
import type {
  GroupLeadersRow,
  GroupMembershipsRow,
  GroupsRow,
  MembersRow,
  ProfilesRow,
} from "@/types/database";
import type { PipelineRollup } from "@/lib/admin/leader-pipeline";

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

export type PeoplePipelineData = {
  rollup: PipelineRollup;
  availableGroups: { id: string; name: string }[];
  error: string | null;
};

// People is the shared people substrate the three jobs draw on (ADR 0013). The
// reduction plan (§6) folds the former Leader Pipeline in as "Apprentices" and
// names five tabs: Directory (everyone), Leaders (current leaders/co-leaders),
// Members (group members), Apprentices (the leader pipeline / future leaders),
// and Add Person. Surfacing apprentices here is a navigation/entry-point change
// only — the pipeline data stays wired into Planning's capacity/multiplication
// flow via the frozen /admin/leader-pipeline route (ADR 0008/0009), which still
// resolves directly and feeds launch staffing supply.
type PeopleView = "directory" | "leaders" | "members" | "apprentices" | "add";

const VIEWS: { value: PeopleView; label: string }[] = [
  { value: "directory", label: "Directory" },
  { value: "leaders", label: "Leaders" },
  { value: "members", label: "Members" },
  { value: "apprentices", label: "Apprentices" },
  { value: "add", label: "Add Person" },
];

export function PeopleManagementShell({
  data,
  pipeline,
  needsContactProfileIds,
}: {
  data: PeopleManagementData;
  pipeline: PeoplePipelineData;
  needsContactProfileIds: ReadonlySet<string>;
}) {
  const [view, setView] = useState<PeopleView>("directory");

  const directoryErrors = useMemo(
    () => ({
      profiles: data.errors.profiles,
      members: data.errors.members,
      leaders: data.errors.leaders,
      memberships: data.errors.memberships,
    }),
    [data.errors]
  );

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <ViewNav view={view} onChange={setView} />

      {view === "directory" || view === "leaders" || view === "members" ? (
        <PeopleDirectory
          scope={view}
          profiles={data.profiles}
          members={data.members}
          groups={data.groups}
          groupLeaders={data.groupLeaders}
          memberships={data.memberships}
          currentActorProfileId={data.currentActorProfileId}
          needsContactProfileIds={needsContactProfileIds}
          errors={directoryErrors}
        />
      ) : null}

      {view === "apprentices" ? (
        <section style={{ display: "grid", gap: 18 }}>
          <SectionHeader
            eyebrow="Apprentices"
            title="Leader pipeline"
            description="Future leaders and where they stand — Identified, In training, Ready to lead, Launched. This is the supply side of multiplication: the same pipeline Planning reads to answer whether upcoming launches have enough ready leaders."
          />
          {pipeline.error ? (
            <p
              style={{
                margin: 0,
                fontFamily: fontBody,
                fontSize: 13,
                color: "#7d3621",
                background: P.terraSoft,
                border: `1px solid ${P.terra}`,
                borderRadius: 8,
                padding: "10px 14px",
              }}
            >
              The leader pipeline could not be loaded: {pipeline.error}
            </p>
          ) : (
            <LeaderPipeline
              rollup={pipeline.rollup}
              availableGroups={pipeline.availableGroups}
            />
          )}
        </section>
      ) : null}

      {view === "add" ? (
        <section style={{ display: "grid", gap: 18 }}>
          <SectionHeader
            eyebrow="Add new"
            title="Add a leader or a member"
            description="Add a leader or a member. Place members in a group from a person's Group tab."
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
                caption="Creates a leader profile."
              />
              <LeaderProfileForm />
            </Card>
            <Card>
              <CardHeader
                title="Add member"
                caption="Participant record. Email is optional."
              />
              <MemberForm />
            </Card>
          </div>
        </section>
      ) : null}
    </div>
  );
}

// Segmented control switching the five People tabs. Toggle buttons (each
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
