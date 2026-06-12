import { describe, expect, it } from "vitest";
import {
  buildCareWorkspace,
  buildGroupNameByShepherdId,
  type CareWorkspaceInput,
} from "@/components/admin/care/care-workspace";
import {
  emptyCareData,
  type CareData,
} from "@/components/admin/care/care-data";
import { EMPTY_ADMIN_FOLLOW_UPS_DATA } from "@/components/admin/follow-ups/follow-ups-data";
import { group } from "@/lib/dashboard/group-fixtures";

const TODAY = "2026-06-12";

const NO_FOLLOW_UP_ERRORS = {
  followUps: null,
  groups: null,
  members: null,
  guests: null,
  profiles: null,
};

const EMPTY_ENRICHMENT: CareWorkspaceInput["enrichment"] = {
  leaderHealthByLeaderId: new Map(),
  groupHealthByGroupId: new Map(),
  noteStateByLeaderId: new Map(),
  gradeEntry: {
    ministryYear: null,
    periodMonthIso: "",
    leaderCriteria: [],
    groupCriteria: [],
    leaderGradeByProfileId: new Map(),
    groupGradeByGroupId: new Map(),
    leaderGradesAvailable: true,
    groupGradesAvailable: true,
  },
  error: null,
};

const EMPTY_NOTES_FEED: CareWorkspaceInput["notesFeed"] = {
  items: [],
  sealedSummary: [],
  feedAvailable: true,
  sealedAvailable: true,
  namesAvailable: true,
};

function careData(overrides: Partial<CareData> = {}): CareData {
  return {
    ...emptyCareData("care unavailable"),
    assignmentsAvailable: true,
    outstandingFollowUpsAvailable: true,
    error: null,
    ...overrides,
  };
}

function workspaceInput(
  overrides: Partial<CareWorkspaceInput> = {}
): CareWorkspaceInput {
  return {
    viewerId: "viewer-1",
    isSuperAdmin: false,
    rosterFilter: "all",
    todayIso: TODAY,
    followUpsData: {
      ...EMPTY_ADMIN_FOLLOW_UPS_DATA,
      errors: NO_FOLLOW_UP_ERRORS,
    },
    care: careData(),
    enrichment: EMPTY_ENRICHMENT,
    notesFeed: EMPTY_NOTES_FEED,
    ...overrides,
  };
}

describe("buildCareWorkspace", () => {
  it("returns the canonical Care tabs from already-loaded data", () => {
    const workspace = buildCareWorkspace(workspaceInput());

    expect(workspace.tabs.map((tab) => tab.key)).toEqual([
      "over-shepherds",
      "all-leaders",
      "follow-ups",
      "recent-interactions",
      "notes",
    ]);
    expect(workspace.tabs.find((tab) => tab.key === "follow-ups")?.count).toBe(
      0
    );
    expect(workspace.errorBanner).toBeNull();
  });

  it("surfaces the Care read error as a page-level banner model", () => {
    const workspace = buildCareWorkspace(
      workspaceInput({ care: careData({ error: "Care read failed" }) })
    );

    expect(workspace.errorBanner).not.toBeNull();
  });
});

describe("buildGroupNameByShepherdId", () => {
  it("joins active related group names, sorted and de-duplicated", () => {
    const names = buildGroupNameByShepherdId(
      [
        { profile_id: "leader-1", group_id: "g-bravo" },
        { profile_id: "leader-1", group_id: "g-alpha" },
        { profile_id: "leader-1", group_id: "g-alpha" },
        { profile_id: "leader-1", group_id: "g-closed" },
      ],
      [
        group({ id: "g-bravo", name: "Bravo" }),
        group({ id: "g-alpha", name: "Alpha" }),
        group({
          id: "g-closed",
          name: "Closed",
          lifecycle_status: "closed",
        }),
      ]
    );

    expect(names.get("leader-1")).toBe("Alpha, Bravo");
  });
});
