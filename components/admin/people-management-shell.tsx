"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EditingSurface } from "@/components/lg/admin/editing-surface";
import { useEditingDrawer } from "@/components/lg/admin/use-editing-drawer";
import { cn } from "@/lib/utils";
import { PeopleDirectory } from "@/components/admin/people-directory";
import { LeaderProfileForm } from "@/components/admin/forms/leader-profile-form";
import { MemberForm } from "@/components/admin/forms/member-form";
import { LeaderPipeline } from "@/components/admin/leader-pipeline/leader-pipeline";
import {
  resolvePeopleTab,
  type PeopleTabKey,
} from "@/components/admin/people/people-tabs";
import type {
  GroupLeadersRow,
  GroupMembershipsRow,
  GroupsRow,
  MembersRow,
  ProfilesRow,
} from "@/types/database";
// Type-only: the data module itself is server-side, the import is erased at
// build time.
import type { LeaderPipelineData } from "@/components/admin/leader-pipeline/leader-pipeline-data";

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

// The Apprentices tab renders the shared leader pipeline, so its data shape
// IS the shared builder's — an alias, not a copy, so the two can't drift.
export type PeoplePipelineData = LeaderPipelineData;

// People is the shared people substrate the three jobs draw on (ADR 0013).
// The surface is two destinations, not five: Directory (everyone, with an
// Everyone / Leaders / Members scope filter inside the list) and Apprentices
// (the leader pipeline / future leaders). Adding a person is an action, not a
// place — the "Add person" header button opens the standard editing drawer.
// Tabs follow the Multiply shell's mechanism: the active tab is driven by the
// URL's `?tab=` param so a refresh keeps your place and the tab is linkable,
// with tab clicks syncing the URL through the History API (no server
// round-trip). The pipeline data stays wired into Planning's capacity flow via
// the frozen /admin/leader-pipeline route (ADR 0008/0009).
export type { PeopleTabKey };

// The drawer adds one person at a time as either kind. Leader is the default:
// it's the kind with downstream consequences (login, care cadence).
type AddPersonKind = "leader" | "member";

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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = resolvePeopleTab(searchParams.get("tab"));

  function selectTab(key: PeopleTabKey) {
    if (key === active) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", key);
    window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
  }

  // The Add person drawer (the standard Editing Pattern, like Groups' New
  // group). Closes + refreshes once the create lands.
  const drawer = useEditingDrawer();
  const [addKind, setAddKind] = useState<AddPersonKind>("leader");
  const openAddPerson = () => {
    setAddKind("leader");
    drawer.open(true);
  };

  // Count badges follow the Care shell rule: a tab omits its badge when the
  // backing read failed, so a badge never reports a false low number.
  const directoryCount =
    data.errors.profiles || data.errors.members
      ? undefined
      : data.profiles.length + data.members.length;
  const apprenticeCount = pipeline.error
    ? undefined
    : pipeline.rollup.totalApprentices;

  const tabs: { key: PeopleTabKey; label: string; count?: number }[] = [
    { key: "directory", label: "Directory", count: directoryCount },
    { key: "apprentices", label: "Apprentices", count: apprenticeCount },
  ];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="People sections"
          className="flex flex-wrap gap-1 self-start rounded-pill border border-line bg-surface p-[3px]"
        >
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              id={`people-tab-${tab.key}`}
              aria-selected={active === tab.key}
              aria-controls={`people-panel-${tab.key}`}
              onClick={() => selectTab(tab.key)}
              className={cn(
                "inline-flex cursor-pointer items-center rounded-pill border-none px-3.5 py-2 font-sans text-sm transition-colors duration-150",
                active === tab.key
                  ? "bg-clay font-bold text-surface"
                  : "bg-transparent font-medium text-ink3 hover:bg-surfaceAlt"
              )}
            >
              {tab.label}
              {typeof tab.count === "number" ? (
                // Full-opacity count: the Care shell's opacity-dimmed count
                // drops ink3 below WCAG AA (axe: 2.94:1), so the count keeps
                // the tab's own text color and reads smaller instead.
                <span className="ml-2 text-xs font-bold tabular-nums">
                  {tab.count}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={openAddPerson}
        >
          Add person
        </Button>
      </div>

      {/* People is the active roster; intake lives in the Plan area. One quiet
          pointer so the admin doesn't add a not-yet-joined person here. */}
      <p className="m-0 -mt-3 font-sans text-sm text-ink3">
        Looking for someone who hasn&rsquo;t joined yet? Prospects live in the{" "}
        <Link
          href="/admin/plan"
          className="font-medium text-clay no-underline hover:underline"
        >
          Interest Funnel →
        </Link>
      </p>

      <div
        role="tabpanel"
        id="people-panel-directory"
        aria-labelledby="people-tab-directory"
        hidden={active !== "directory"}
      >
        <PeopleDirectory
          profiles={data.profiles}
          members={data.members}
          groups={data.groups}
          groupLeaders={data.groupLeaders}
          memberships={data.memberships}
          currentActorProfileId={data.currentActorProfileId}
          needsContactProfileIds={needsContactProfileIds}
          isSuperAdmin={isSuperAdmin}
          errors={{
            profiles: data.errors.profiles,
            members: data.errors.members,
            leaders: data.errors.leaders,
            memberships: data.errors.memberships,
          }}
        />
      </div>

      <div
        role="tabpanel"
        id="people-panel-apprentices"
        aria-labelledby="people-tab-apprentices"
        hidden={active !== "apprentices"}
      >
        <section className="grid gap-[18px]">
          <div>
            <h3 className="m-0 font-display text-xl font-medium text-ink">
              Leader pipeline
            </h3>
            <p className="m-0 mt-1.5 max-w-lede font-sans text-sm text-ink2">
              Future leaders and where they stand &mdash; Identified, In
              training, Ready to lead, Launched. This is the supply side of
              multiplication: the same pipeline that answers whether upcoming
              launches have enough ready leaders.
            </p>
          </div>
          {pipeline.error ? (
            <p className="m-0 rounded-md bg-claySoft px-3.5 py-2.5 font-sans text-base text-clayDeep">
              The leader pipeline could not be loaded: {pipeline.error}
            </p>
          ) : (
            <LeaderPipeline
              rollup={pipeline.rollup}
              availableGroups={pipeline.availableGroups}
              memberOptionsByGroup={pipeline.memberOptionsByGroup}
            />
          )}
        </section>
      </div>

      <EditingSurface
        open={drawer.isOpen}
        onRequestClose={drawer.requestClose}
        eyebrow="People"
        title="Add a person"
        description="A Leader signs in and shepherds a group. A Member takes part in a group — no login."
        closeLabel="Close add person form"
      >
        <AddPersonKindToggle value={addKind} onChange={setAddKind} />
        {addKind === "leader" ? (
          <LeaderProfileForm
            onSaved={drawer.markSaved}
            onDirty={drawer.markDirty}
            onCancel={drawer.requestClose}
            onPendingChange={drawer.reportPending}
          />
        ) : (
          <MemberForm
            onSaved={drawer.markSaved}
            onDirty={drawer.markDirty}
            onCancel={drawer.requestClose}
            onPendingChange={drawer.reportPending}
          />
        )}
      </EditingSurface>
    </div>
  );
}

// Two-option segmented control choosing which kind of person the drawer adds.
// A radiogroup (like the Groups card⇄table toggle) so the current kind is
// announced and keyboard-reachable.
function AddPersonKindToggle({
  value,
  onChange,
}: {
  value: AddPersonKind;
  onChange: (next: AddPersonKind) => void;
}) {
  const options: { key: AddPersonKind; label: string }[] = [
    { key: "leader", label: "Leader" },
    { key: "member", label: "Member" },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Kind of person"
      className="inline-flex flex-wrap gap-1 self-start rounded-pill border border-line bg-sidebar p-1"
    >
      {options.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.key)}
            className={cn(
              "cursor-pointer rounded-pill border px-3.5 py-2 font-sans text-sm font-medium leading-tight transition-colors duration-150",
              active
                ? "border-line bg-surface font-semibold text-ink"
                : "border-transparent bg-transparent text-ink2 hover:bg-surface/60"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
