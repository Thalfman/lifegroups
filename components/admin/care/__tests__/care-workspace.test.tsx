import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
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
import { group, profile } from "@/lib/dashboard/group-fixtures";
import type { ShepherdCareDirectoryEntry } from "@/lib/supabase/shepherd-care-reads";

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

function leaderEntry(id = "leader-1"): ShepherdCareDirectoryEntry {
  return {
    profile: profile({
      id,
      full_name: "Lena Leader",
      email: "lena@example.com",
      role: "leader",
      status: "active",
    }),
    care: null,
    needs_attention: false,
  };
}

function tabMarkup(
  workspace: ReturnType<typeof buildCareWorkspace>,
  key: string
): string {
  const panel = workspace.tabs.find((tab) => tab.key === key)?.panel;
  expect(panel).toBeDefined();
  return renderToStaticMarkup(<>{panel}</>);
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
    // #644: the Follow-ups tab no longer carries a single combined count badge;
    // the two queues' open counts render as separate labelled figures in the
    // panel instead (asserted in care-area + the structural source test).
    expect(
      workspace.tabs.find((tab) => tab.key === "follow-ups")?.count
    ).toBeUndefined();
    expect(workspace.errorBanner).toBeNull();
  });

  it("surfaces the Care read error as a page-level banner model", () => {
    const workspace = buildCareWorkspace(
      workspaceInput({ care: careData({ error: "Care read failed" }) })
    );

    expect(workspace.errorBanner).not.toBeNull();
  });

  it("explains the setup chain when there are no active care leaders", () => {
    const workspace = buildCareWorkspace(workspaceInput());
    const html = tabMarkup(workspace, "over-shepherds");

    expect(html).toContain("Care setup path");
    expect(html).toContain(
      "Care will turn on after people are imported, leaders are marked"
    );
  });

  it("shows a neutral not-active care state that deep-links into setup, not vacuous success (#649)", () => {
    // The default fixture has no active care leaders.
    const workspace = buildCareWorkspace(workspaceInput());
    const html = tabMarkup(workspace, "all-leaders");

    expect(html).toContain("Care coverage is not active yet");
    expect(html).toContain("/admin?from=setup");
    // The vacuous success metas are gone when there are zero leaders.
    expect(html).not.toContain("Everyone is up to date");
    expect(html).not.toContain("Every active leader is covered");
    // The summary panel is the single neutral state, so the all-leaders tab does
    // not also stack the Care setup notice.
    expect(html).not.toContain("Care setup path");
  });

  it("points to coverage setup when leaders exist but coverage is unassigned", () => {
    const workspace = buildCareWorkspace(
      workspaceInput({
        isSuperAdmin: true,
        care: careData({ entries: [leaderEntry()], assignments: [] }),
      })
    );
    const html = tabMarkup(workspace, "all-leaders");

    expect(html).toContain("Leaders exist, but coverage is not assigned yet");
    expect(html).toContain("/admin/super-admin#coverage");
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
