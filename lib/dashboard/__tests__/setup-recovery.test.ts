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
        not_assessed: 16,
        missing_required_ratings: 0,
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
  it("turns a first-launch recovery state into six guided setup steps", () => {
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
      "set_capacity",
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
        href: "/admin/settings?tab=system&from=setup#people-import",
        label: "Import people",
      },
      {
        status: "needs_action",
        count: 16,
        href: "/admin/groups?tab=needs_setup&from=setup",
        label: "Assign shepherds",
      },
      {
        status: "needs_action",
        count: 16,
        href: "/admin/groups?tab=needs_setup&from=setup",
        label: "Assign members",
      },
      {
        status: "complete",
        count: 0,
        href: "/admin/groups?tab=needs_setup&from=setup",
        label: "Set capacity",
      },
      {
        status: "needs_action",
        count: 9,
        href: "/admin/groups?tab=needs_setup&from=setup",
        label: "Set meeting info",
      },
      {
        status: "needs_action",
        count: 16,
        href: "/admin/groups?tab=needs_health_check&from=setup",
        label: "Assess health",
      },
    ]);
  });

  it("routes every admin's Import people step to the Settings importer", () => {
    // Bulk import is now an admin capability in Settings > System (no
    // Super-Admin-console hop), so super and non-super admins share one target.
    for (const isSuperAdmin of [true, false]) {
      const checklist = buildSetupRecoveryChecklist(launchRecoveryDashboard(), {
        isSuperAdmin,
      });

      expect(checklist.steps[0]).toMatchObject({
        key: "import_people",
        href: "/admin/settings?tab=system&from=setup#people-import",
        label: "Import people",
        actionLabel: "Import people",
      });
    }
  });

  it("marks every setup deep-link with from=setup (ADR 0027)", () => {
    const checklist = buildSetupRecoveryChecklist(launchRecoveryDashboard(), {
      isSuperAdmin: true,
    });
    for (const step of checklist.steps) {
      expect(step.href).toContain("from=setup");
    }
  });

  it("keeps the checklist visible when capacity is the only setup gap", () => {
    const data = launchRecoveryDashboard();
    data.setupGaps.counts = {
      noCapacity: 2,
      noLeader: 0,
      noMeetingDayTime: 0,
      noMembers: 0,
    };
    data.healthSummary.counts.missing = 0;
    data.healthSummary.counts.not_assessed = 0;
    data.launchPlanning.currentParticipants = 24;
    data.shepherdCare.totalActiveShepherds = 8;

    const checklist = buildSetupRecoveryChecklist(data);

    expect(checklist.show).toBe(true);
    expect(checklist.setupGapCount).toBe(2);
    expect(checklist.incompleteCount).toBe(1);
    expect(
      checklist.steps.find((step) => step.key === "set_capacity")
    ).toMatchObject({
      status: "needs_action",
      count: 2,
    });
  });

  it("uses the Groups health-check tab counts for the health step", () => {
    const data = launchRecoveryDashboard();
    data.setupGaps.counts = {
      noCapacity: 0,
      noLeader: 0,
      noMeetingDayTime: 0,
      noMembers: 0,
    };
    data.healthSummary.counts.missing = 0;
    data.healthSummary.counts.needs_follow_up = 0;
    data.healthSummary.counts.not_assessed = 2;
    data.healthSummary.counts.missing_required_ratings = 3;
    data.launchPlanning.currentParticipants = 24;
    data.shepherdCare.totalActiveShepherds = 8;

    const checklist = buildSetupRecoveryChecklist(data);

    expect(checklist.show).toBe(true);
    expect(checklist.incompleteCount).toBe(1);
    expect(
      checklist.steps.find((step) => step.key === "assess_health")
    ).toMatchObject({
      status: "needs_action",
      count: 5,
    });
  });

  it("does not send weekly pulse work to the Groups health-check tab", () => {
    const data = launchRecoveryDashboard();
    data.setupGaps.counts = {
      noCapacity: 0,
      noLeader: 0,
      noMeetingDayTime: 0,
      noMembers: 0,
    };
    data.healthSummary.counts.missing = 4;
    data.healthSummary.counts.needs_follow_up = 2;
    data.healthSummary.counts.not_assessed = 0;
    data.healthSummary.counts.missing_required_ratings = 0;
    data.launchPlanning.currentParticipants = 24;
    data.shepherdCare.totalActiveShepherds = 8;

    const checklist = buildSetupRecoveryChecklist(data);

    expect(checklist.show).toBe(false);
    expect(
      checklist.steps.find((step) => step.key === "assess_health")
    ).toMatchObject({
      status: "complete",
      count: 0,
    });
  });

  it("keeps the import step but suppresses Groups-targeted steps when those surfaces are hidden", () => {
    const checklist = buildSetupRecoveryChecklist(launchRecoveryDashboard(), {
      isSuperAdmin: true,
      hiddenNavAreas: ["/admin/groups", "/admin/people"],
    });

    // Import lives in always-reachable Settings, so hiding the People nav does
    // NOT drop it; only the Groups-targeted setup steps are suppressed.
    expect(checklist.steps.map((step) => step.key)).toEqual(["import_people"]);
    expect(checklist.steps[0].href).toBe(
      "/admin/settings?tab=system&from=setup#people-import"
    );
    expect(checklist.show).toBe(true);
    expect(checklist.setupGapCount).toBe(0);
  });
});
