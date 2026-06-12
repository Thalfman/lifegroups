import { describe, expect, it } from "vitest";

import { buildSetupRecoveryChecklist } from "@/lib/dashboard/setup-recovery";
import type { AdminDashboardData } from "@/lib/dashboard/types";

function launchRecoveryDashboard(): AdminDashboardData {
  return {
    summary: {
      activeGroupCount: 16,
      submittedCheckIns: 0,
      missingCheckIns: 16,
      needsFollowUp: 0,
      capacityWatch: 0,
      unknownCapacity: 0,
    },
    setupGaps: {
      noCapacity: [],
      noLeader: [],
      noMeetingDayTime: [],
      noMembers: [],
      counts: {
        noCapacity: 0,
        noLeader: 16,
        noMeetingDayTime: 9,
        noMembers: 16,
      },
    },
    healthSummary: {
      submitted: [],
      missing: [],
      didNotMeet: [],
      plannedPause: [],
      needsFollowUp: [],
      watch: [],
      healthy: [],
      counts: {
        submitted: 0,
        missing: 16,
        did_not_meet: 0,
        planned_pause: 0,
        needs_follow_up: 0,
        watch: 0,
        healthy: 0,
      },
    },
    shepherdCare: {
      totalActiveShepherds: 0,
      needsAttention: 0,
      overdueTouchpoints: 0,
      notContactedRecently: 0,
      noCareProfile: 0,
      unassignedCoverage: 0,
      activeOverShepherds: null,
      attentionItemsTotal: 0,
      coverageAvailable: true,
      available: true,
      error: null,
    },
    launchPlanning: {
      effectiveTotalCapacity: 0,
      currentParticipants: 0,
      projectedGroupDemand: 0,
      capacityGap: 0,
      recommendedNewGroups: 0,
      estimatedNewLeadersNeeded: 0,
      riskLevel: "low",
      suggestedLaunchByDate: null,
      unknownCapacityGroupCount: 0,
      excludedActiveGroupCount: 0,
      currentChurchAttendance: 0,
      participationPct: null,
      assumptionsAvailable: true,
      available: true,
      error: null,
    },
  } as unknown as AdminDashboardData;
}

describe("buildSetupRecoveryChecklist", () => {
  it("turns a first-launch recovery state into five guided setup steps", () => {
    const checklist = buildSetupRecoveryChecklist(launchRecoveryDashboard(), {
      isSuperAdmin: true,
    });

    expect(checklist.show).toBe(true);
    expect(checklist.setupGapCount).toBe(41);
    expect(checklist.incompleteCount).toBe(5);
    expect(checklist.steps.map((step) => step.key)).toEqual([
      "import_people",
      "assign_leaders",
      "assign_members",
      "set_meeting_info",
      "assess_health",
    ]);
    expect(
      checklist.steps.map(({ status, count, href, label }) => ({
        status,
        count,
        href,
        label,
      }))
    ).toEqual([
      {
        status: "needs_action",
        count: 0,
        href: "/admin/super-admin#people-import",
        label: "Import people",
      },
      {
        status: "needs_action",
        count: 16,
        href: "/admin/groups?tab=needs_setup",
        label: "Assign leaders",
      },
      {
        status: "needs_action",
        count: 16,
        href: "/admin/groups?tab=needs_setup",
        label: "Assign members",
      },
      {
        status: "needs_action",
        count: 9,
        href: "/admin/groups?tab=needs_setup",
        label: "Set meeting info",
      },
      {
        status: "needs_action",
        count: 16,
        href: "/admin/groups?tab=needs_health_check",
        label: "Assess health",
      },
    ]);
  });

  it("uses People instead of Super Admin import for non-super-admins", () => {
    const checklist = buildSetupRecoveryChecklist(launchRecoveryDashboard(), {
      isSuperAdmin: false,
    });

    expect(checklist.steps[0]).toMatchObject({
      key: "import_people",
      href: "/admin/people",
    });
  });
});
