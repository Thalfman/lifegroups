import { GroupsDirectory } from "@/components/admin/groups-directory";
import {
  EMPTY_CATEGORIES_BY_AUDIENCE,
  type CategoriesByAudience,
} from "@/components/admin/forms/group-category-options";
import type { GroupListTab } from "@/lib/dashboard/group-status";
import type { MetricDefaults } from "@/lib/admin/metrics";
import type { GroupHealthLetter } from "@/types/enums";
import type {
  AttendanceSessionsRow,
  GroupLeadersRow,
  GroupMembershipsRow,
  GroupMetricSettingsRow,
  GroupsRow,
  ProfilesRow,
} from "@/types/database";

// Per-group triage signals that the four status labels alone don't carry. All
// default to "no concern" when absent, so a group the overview never returned
// (or a failed side read) never spuriously lands in a triage tab.
export type GroupHealthSignals = {
  // One or more required ratings (spiritual-growth / group-question) are not yet
  // recorded for the current period — distinct from "not assessed", because a
  // group can have an attendance-derived grade letter while still missing these.
  missingRequiredRatings: boolean;
  // The group has at least one open / in-progress generic follow-up, or the
  // director's group-health "needs follow-up" flag is set.
  hasOpenFollowUp: boolean;
  // A leader / co-leader of this group has an open shepherd-care concern
  // (per-leader care model, PRD). Members are never counted.
  hasCareConcern: boolean;
};

export type GroupManagementData = {
  groups: GroupsRow[];
  groupLeaders: GroupLeadersRow[];
  profiles: ProfilesRow[];
  memberships: GroupMembershipsRow[];
  latestSessions: AttendanceSessionsRow[];
  latestWeek: string | null;
  metricDefaults: MetricDefaults;
  groupMetricSettings: GroupMetricSettingsRow[];
  // The Group-Health Grade (Q12 computed letter) per group id, for the Health
  // zone. Absent / null = not assessed. Keyed by group id; closed groups are
  // simply absent (the overview reads active groups only).
  healthGradesByGroupId: Record<string, GroupHealthLetter | null>;
  // Per-group triage signals beyond the grade letter, projected from the same
  // group-health overview the Health zone uses, plus the group's open follow-up
  // and leader-care concern reads. These drive the Needs Health Check (missing
  // required ratings) and Needs Attention (union of concerns) tabs per plan §4.
  healthSignalsByGroupId: Record<string, GroupHealthSignals>;
  // #398: category-picker options grouped by top type, for the group create/edit
  // forms. Each list is the live categories applied (active cell) to that
  // audience. Empty when the catalog read failed or nothing is applied yet.
  categoriesByAudience: CategoriesByAudience;
  errors: {
    groups: string | null;
    leaders: string | null;
    profiles: string | null;
    memberships: string | null;
    sessions: string | null;
    settings: string | null;
    // The Group-Health overview read. When it fails the grade/​signal maps are
    // empty, so every group would otherwise read as "Not assessed" with no
    // warning — surface the failure rather than silently misclassifying.
    health: string | null;
    // #398 review: the create/edit category-picker option reads. When they fail
    // the picker degrades to no categories; surfaced so an admin sees that
    // rather than unknowingly editing with an empty picker.
    categoryOptions: string | null;
  };
};

export function GroupManagementShell({
  data,
  viewerId,
  isSuperAdmin = false,
  initialTab,
  fromSetup = false,
}: {
  data: GroupManagementData;
  // Signed-in profile id, threaded only to scope this browser's saved
  // card⇄table view preference per admin (#325). Null when no identity is
  // available; the directory falls back to a shared bucket.
  viewerId?: string | null;
  // SAD9: super-admin-only inline permanent delete of a group record.
  isSuperAdmin?: boolean;
  initialTab?: GroupListTab;
  // ADR 0027: arrived via a setup deep-link; carry the marker into detail links.
  fromSetup?: boolean;
}) {
  const anyError =
    data.errors.groups ||
    data.errors.leaders ||
    data.errors.profiles ||
    data.errors.memberships ||
    data.errors.sessions ||
    data.errors.settings ||
    data.errors.health ||
    data.errors.categoryOptions;

  return (
    <div className="grid gap-9">
      {anyError ? (
        // Degraded-read note (the claySoft voice the Care/Plan banners use):
        // the page renders what it did get rather than failing closed.
        <p
          role="alert"
          className="m-0 rounded-md bg-claySoft px-3.5 py-2.5 font-sans text-base text-clayDeep"
        >
          One or more reads failed. The page below shows what we did get; retry
          in a moment or check the database connection.
        </p>
      ) : null}

      {/* Groups is the single source of truth for setup, health, capacity, and
          lifecycle (#300). The directory hosts the five list tabs (including
          Archived), the four independent status labels, and the six-zone cards;
          creating opens the shared editing drawer from its "New group" control
          (#266). */}
      <GroupsDirectory
        groups={data.groups}
        groupLeaders={data.groupLeaders}
        profiles={data.profiles}
        memberships={data.memberships}
        latestSessions={data.latestSessions}
        latestWeek={data.latestWeek}
        metricDefaults={data.metricDefaults}
        groupMetricSettings={data.groupMetricSettings}
        healthGradesByGroupId={data.healthGradesByGroupId}
        healthSignalsByGroupId={data.healthSignalsByGroupId}
        watchGrade={data.metricDefaults.group_health_watch_grade}
        viewerId={viewerId}
        isSuperAdmin={isSuperAdmin}
        initialTab={initialTab}
        fromSetup={fromSetup}
        categoriesByAudience={
          data.categoriesByAudience ?? EMPTY_CATEGORIES_BY_AUDIENCE
        }
      />
    </div>
  );
}
