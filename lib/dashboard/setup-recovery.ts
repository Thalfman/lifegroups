import type { AdminDashboardData } from "@/lib/dashboard/types";

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

function plural(value: number, singular: string, pluralLabel = `${singular}s`) {
  return `${value} ${value === 1 ? singular : pluralLabel}`;
}

function statusFromCount(count: number): SetupRecoveryStatus {
  return count > 0 ? "needs_action" : "complete";
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
  const peopleHidden = hasHiddenArea(options.hiddenNavAreas, "/admin/people");

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

  const importHref = options.isSuperAdmin
    ? "/admin/super-admin#people-import"
    : "/admin/people";

  const steps: SetupRecoveryChecklistRow[] = [];

  if (!peopleHidden) {
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
      actionLabel: options.isSuperAdmin ? "Import people" : "Open People",
      detail:
        currentParticipants === null
          ? "People counts could not be read, so confirm the roster before launch."
          : currentParticipants === 0
            ? "No people are currently attached to active groups."
            : `${plural(currentParticipants, "person", "people")} already attached to active groups.`,
    });
  }

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
              ? `${plural(leaderNeeds, "group")} need a leader.`
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
              ? `${plural(memberNeeds, "group")} need members.`
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
            ? `${plural(data.setupGaps.counts.noCapacity, "group")} need capacity.`
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
            ? `${plural(data.setupGaps.counts.noMeetingDayTime, "group")} need day and time.`
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
            ? `${plural(healthNeedsCount, "group")} need a health check.`
            : "Every group has a current health signal.",
      }
    );
  }

  const incompleteCount = steps.filter(
    (step) => step.status !== "complete"
  ).length;

  return {
    steps,
    incompleteCount,
    totalCount: steps.length,
    setupGapCount,
    show: incompleteCount > 0,
  };
}
