import type { AdminDashboardData } from "@/lib/dashboard/types";
import { PEOPLE_IMPORT_HREF } from "@/lib/admin/people-import";

export type SetupRecoveryStepKey =
  | "import_people"
  | "assign_leaders"
  | "assign_members"
  | "set_capacity"
  | "set_meeting_info"
  | "assess_health";

export type SetupRecoveryStatus = "complete" | "needs_action" | "unavailable";

export type SetupRecoveryChecklistRow = {
  key: SetupRecoveryStepKey;
  status: SetupRecoveryStatus;
  count: number;
  href: string;
  label: string;
  detail: string;
  actionLabel: string;
};

export type SetupRecoveryChecklist = {
  steps: SetupRecoveryChecklistRow[];
  incompleteCount: number;
  totalCount: number;
  setupGapCount: number;
  show: boolean;
};

type SetupRecoveryOptions = {
  isSuperAdmin?: boolean;
  hiddenNavAreas?: ReadonlySet<string> | readonly string[];
};

function countWithNoun(
  value: number,
  singular: string,
  pluralLabel = `${singular}s`
) {
  return `${value} ${value === 1 ? singular : pluralLabel}`;
}

function statusFromCount(count: number): SetupRecoveryStatus {
  return count > 0 ? "needs_action" : "complete";
}

// ADR 0027: setup deep-links carry a `?from=setup` marker so the target surface
// renders a reusable "← Back to setup" affordance and returning to Home
// re-focuses the next incomplete step. Append it without clobbering an existing
// query string or fragment (e.g. `/admin/settings?tab=system#people-import` →
// `/admin/settings?tab=system&from=setup#people-import`).
export const FROM_SETUP_PARAM = "from";
export const FROM_SETUP_VALUE = "setup";

function withFromSetup(href: string): string {
  const [path, hash] = href.split("#");
  const separator = path.includes("?") ? "&" : "?";
  const withMarker = `${path}${separator}${FROM_SETUP_PARAM}=${FROM_SETUP_VALUE}`;
  return hash ? `${withMarker}#${hash}` : withMarker;
}

function hasHiddenArea(
  hiddenNavAreas: SetupRecoveryOptions["hiddenNavAreas"],
  href: string
): boolean {
  if (!hiddenNavAreas) return false;
  return typeof (hiddenNavAreas as ReadonlySet<string>).has === "function"
    ? (hiddenNavAreas as ReadonlySet<string>).has(href)
    : (hiddenNavAreas as readonly string[]).includes(href);
}

export function buildSetupRecoveryChecklist(
  data: AdminDashboardData,
  options: SetupRecoveryOptions = {}
): SetupRecoveryChecklist {
  const activeGroups = data.summary.activeGroupCount;
  const currentParticipants = data.launchPlanning.available
    ? data.launchPlanning.currentParticipants
    : null;
  const activeLeaders = data.shepherdCare.available
    ? data.shepherdCare.totalActiveShepherds
    : null;
  const groupsHidden = hasHiddenArea(options.hiddenNavAreas, "/admin/groups");

  const rawSetupGapCount =
    data.setupGaps.counts.noCapacity +
    data.setupGaps.counts.noLeader +
    data.setupGaps.counts.noMeetingDayTime +
    data.setupGaps.counts.noMembers;
  const setupGapCount = groupsHidden ? 0 : rawSetupGapCount;
  const healthNeedsCount =
    data.healthSummary.counts.not_assessed +
    data.healthSummary.counts.missing_required_ratings;

  const peopleNeedImport =
    currentParticipants !== null &&
    currentParticipants === 0 &&
    activeGroups > 0;
  const importPeopleNeeds =
    currentParticipants === null
      ? 0
      : peopleNeedImport
        ? currentParticipants
        : 0;
  const leaderNeeds =
    activeLeaders === null
      ? 0
      : data.setupGaps.counts.noLeader > 0
        ? data.setupGaps.counts.noLeader
        : activeLeaders === 0 && activeGroups > 0
          ? activeGroups
          : 0;
  const memberNeeds =
    currentParticipants === null
      ? 0
      : data.setupGaps.counts.noMembers > 0
        ? data.setupGaps.counts.noMembers
        : currentParticipants === 0 && activeGroups > 0
          ? activeGroups
          : 0;

  // Bulk import is now an admin capability hosted in Settings > System (no
  // Super-Admin-console hop), so every role's "Import people" step lands on the
  // same admin importer regardless of isSuperAdmin.
  const importHref = PEOPLE_IMPORT_HREF;

  const steps: SetupRecoveryChecklistRow[] = [];

  // The import step is NOT gated on People-nav visibility: bulk import now lives
  // in Settings > System (always reachable by admins), so hiding the People tab
  // must not drop the only roster-import CTA. (Group-setup steps below still
  // follow Groups visibility, since they deep-link into the Groups surface.)
  steps.push({
    key: "import_people",
    status:
      currentParticipants === null
        ? "unavailable"
        : peopleNeedImport
          ? "needs_action"
          : statusFromCount(importPeopleNeeds),
    count: currentParticipants ?? 0,
    href: importHref,
    label: "Import people",
    actionLabel: "Import people",
    detail:
      currentParticipants === null
        ? "People counts could not be read, so confirm the roster before launch."
        : currentParticipants === 0
          ? "No people are currently attached to active groups."
          : `${countWithNoun(currentParticipants, "person", "people")} already attached to active groups.`,
  });

  if (!groupsHidden) {
    steps.push(
      {
        key: "assign_leaders",
        status:
          activeLeaders === null ? "unavailable" : statusFromCount(leaderNeeds),
        count: leaderNeeds,
        href: "/admin/groups?tab=needs_setup",
        label: "Assign leaders",
        actionLabel: "Assign leaders",
        detail:
          activeLeaders === null
            ? "Leader counts could not be read, so review groups before launch."
            : leaderNeeds > 0
              ? `${countWithNoun(leaderNeeds, "group")} need a leader.`
              : "Every active group has a leader.",
      },
      {
        key: "assign_members",
        status:
          currentParticipants === null
            ? "unavailable"
            : statusFromCount(memberNeeds),
        count: memberNeeds,
        href: "/admin/groups?tab=needs_setup",
        label: "Assign members",
        actionLabel: "Assign members",
        detail:
          currentParticipants === null
            ? "Member counts could not be read, so review rosters before launch."
            : memberNeeds > 0
              ? `${countWithNoun(memberNeeds, "group")} need members.`
              : "Every active group has at least one member.",
      },
      {
        key: "set_capacity",
        status: statusFromCount(data.setupGaps.counts.noCapacity),
        count: data.setupGaps.counts.noCapacity,
        href: "/admin/groups?tab=needs_setup",
        label: "Set capacity",
        actionLabel: "Set capacity",
        detail:
          data.setupGaps.counts.noCapacity > 0
            ? `${countWithNoun(data.setupGaps.counts.noCapacity, "group")} need capacity.`
            : "Every active group has capacity set.",
      },
      {
        key: "set_meeting_info",
        status: statusFromCount(data.setupGaps.counts.noMeetingDayTime),
        count: data.setupGaps.counts.noMeetingDayTime,
        href: "/admin/groups?tab=needs_setup",
        label: "Set meeting info",
        actionLabel: "Set meeting info",
        detail:
          data.setupGaps.counts.noMeetingDayTime > 0
            ? `${countWithNoun(data.setupGaps.counts.noMeetingDayTime, "group")} need day and time.`
            : "Every active group has day and time set.",
      },
      {
        key: "assess_health",
        status: statusFromCount(healthNeedsCount),
        count: healthNeedsCount,
        href: "/admin/groups?tab=needs_health_check",
        label: "Assess health",
        actionLabel: "Assess health",
        detail:
          healthNeedsCount > 0
            ? `${countWithNoun(healthNeedsCount, "group")} need a health check.`
            : "Every group has a current health signal.",
      }
    );
  }

  const incompleteCount = steps.filter(
    (step) => step.status !== "complete"
  ).length;

  // Decorate every deep-link with the from=setup marker last, so each step's
  // raw href above stays readable and the marker is applied in exactly one place.
  const markedSteps = steps.map((step) => ({
    ...step,
    href: withFromSetup(step.href),
  }));

  return {
    steps: markedSteps,
    incompleteCount,
    totalCount: steps.length,
    setupGapCount,
    show: incompleteCount > 0,
  };
}
