"use client";

import { useMemo, useState } from "react";
import { SectionHeader } from "@/components/layout/shell";
import { Card } from "@/components/lg/Card";
import { cn } from "@/lib/utils";
import { PeopleDirectory } from "@/components/admin/people-directory";
import { LeaderProfileForm } from "@/components/admin/forms/leader-profile-form";
import { MemberForm } from "@/components/admin/forms/member-form";
import { LeaderPipeline } from "@/components/admin/leader-pipeline/leader-pipeline";
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
  isSuperAdmin = false,
}: {
  data: PeopleManagementData;
  pipeline: PeoplePipelineData;
  needsContactProfileIds: ReadonlySet<string>;
  // SAD9: super-admin-only inline permanent delete on the directory rows.
  isSuperAdmin?: boolean;
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
    <div className="grid gap-6">
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
          isSuperAdmin={isSuperAdmin}
          errors={directoryErrors}
        />
      ) : null}

      {view === "apprentices" ? (
        <section className="grid gap-[18px]">
          <SectionHeader
            eyebrow="Apprentices"
            title="Leader pipeline"
            description="Future leaders and where they stand — Identified, In training, Ready to lead, Launched. This is the supply side of multiplication: the same pipeline Planning reads to answer whether upcoming launches have enough ready leaders."
          />
          {pipeline.error ? (
            <p className="m-0 rounded-md bg-claySoft px-3.5 py-2.5 font-sans text-base text-clayDeep">
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
        <section className="grid gap-[18px]">
          <SectionHeader
            eyebrow="Add new"
            title="Add a leader or a member"
            description="Add a leader or a member. Place members in a group from a person's Group tab."
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
      className="flex flex-wrap gap-1 self-start rounded-pill border border-line bg-surface p-[3px]"
    >
      {VIEWS.map((v) => {
        const active = v.value === view;
        return (
          <button
            key={v.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(v.value)}
            className={cn(
              "inline-flex cursor-pointer items-center rounded-pill border-none px-3.5 py-2 font-sans text-sm transition-colors duration-150",
              active
                ? "bg-clay font-bold text-surface"
                : "bg-transparent font-medium text-ink3 hover:bg-surfaceAlt"
            )}
          >
            {v.label}
          </button>
        );
      })}
    </nav>
  );
}

function CardHeader({ title, caption }: { title: string; caption: string }) {
  return (
    <div className="mb-3.5">
      <h3 className="m-0 font-display text-lg font-medium text-ink">{title}</h3>
      <p className="m-0 mt-0.5 font-sans text-xs text-ink3">{caption}</p>
    </div>
  );
}
