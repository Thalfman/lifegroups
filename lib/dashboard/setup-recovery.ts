import type { AdminDashboardData } from "@/lib/dashboard/types";

export type SetupRecoveryStepKey =
  | "import_people"
  | "assign_leaders"
  | "assign_members"
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
};

function plural(value: number, singular: string, pluralLabel = `${singular}s`) {
  return `${value} ${value === 1 ? singular : pluralLabel}`;
}

function statusFromCount(count: number): SetupRecoveryStatus {
  return count > 0 ? "needs_action" : "complete";
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

  const setupGapCount =
    data.setupGaps.counts.noCapacity +
    data.setupGaps.counts.noLeader +
    data.setupGaps.counts.noMeetingDayTime +
    data.setupGaps.counts.noMembers;
  const healthNeedsCount =
    data.healthSummary.counts.missing +
    data.healthSummary.counts.needs_follow_up;

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

  const steps: SetupRecoveryChecklistRow[] = [
    {
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
    },
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
    },
  ];

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
