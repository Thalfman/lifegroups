import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// #478 (P2.2): the per-group override summary must echo the CANONICAL
// health-status labels — the ONE shared map the override form's dropdown also
// offers — never de-underscored enum text ("needs follow up"). The shared map
// itself is pinned here too, so a drift between the dropdown's wording and
// CONTEXT.md vocabulary fails a unit test before it reaches a surface.

// The shell's editors bind "use server" actions; stub both action modules so
// static rendering never pulls server-only deps (the markup never invokes
// them). Same approach as settings-shell-errors.test.tsx.
vi.mock("@/app/(protected)/admin/settings/actions", () => ({
  adminUpdateMetricDefaults: vi.fn(),
  adminUpsertGroupMetricSettings: vi.fn(),
  adminResetMetricDefaults: vi.fn(),
  adminSetHealthRubric: vi.fn(),
  adminCreateGroupCategory: vi.fn(),
  adminRenameGroupCategory: vi.fn(),
  adminArchiveGroupCategory: vi.fn(),
  adminSetCategoryTypeCell: vi.fn(),
  adminSetCategoryTypeTargetCount: vi.fn(),
  adminSetGroupCategory: vi.fn(),
  adminSetReadinessRule: vi.fn(),
  adminSetAudienceReadinessRule: vi.fn(),
  adminSetCellTriggerOverrides: vi.fn(),
}));
vi.mock("@/app/(protected)/admin/groups/actions", () => ({
  adminCreateGroup: vi.fn(),
  adminUpdateGroup: vi.fn(),
  adminCloseGroup: vi.fn(),
  adminReopenGroup: vi.fn(),
}));
// The Groups catalog editor's drawer hook calls useRouter(); there is no app
// router mounted in a static render, so stub the hook.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

import {
  SettingsShell,
  type SettingsShellData,
} from "@/components/admin/settings-shell";
import { BUILT_IN_METRIC_DEFAULTS } from "@/lib/admin/metrics";
import { BUILT_IN_READINESS_RULE } from "@/lib/admin/cell-readiness";
import { EMPTY_CATEGORIES_BY_AUDIENCE } from "@/components/admin/forms/group-category-options";
import { group, settings } from "@/lib/dashboard/group-fixtures";
import {
  GROUP_HEALTH_STATUS_LABEL,
  groupHealthStatusLabel,
} from "@/lib/admin/health-status-labels";

function shellData(): SettingsShellData {
  return {
    defaults: BUILT_IN_METRIC_DEFAULTS,
    defaultsSource: "live",
    groups: [group({ id: "g-1", name: "Anderson" })],
    groupMetricSettings: [
      settings({
        group_id: "g-1",
        manual_health_status_override: "needs_follow_up",
      }),
    ],
    groupRubricCriteria: [],
    hasSavedGroupRubric: true,
    leaderRubricCriteria: [],
    groupCategories: [],
    categoriesByAudience: EMPTY_CATEGORIES_BY_AUDIENCE,
    cellCoverage: [],
    readiness: {
      ministryYear: 2026,
      rule: BUILT_IN_READINESS_RULE,
      ruleFellBack: false,
      perType: {},
      cells: [],
    },
    isSuperAdmin: false,
    errors: {
      defaults: null,
      groups: null,
      overrides: null,
      groupRubric: null,
      leaderRubric: null,
      groupCategories: null,
      readiness: null,
    },
  };
}

describe("SettingsShell override summary — canonical status labels (#478)", () => {
  it("renders the canonical label, never de-underscored enum text", () => {
    const html = renderToStaticMarkup(
      <SettingsShell data={shellData()} initialTabId="thresholds" />
    );

    expect(html).toContain("Health: Needs follow-up");
    expect(html).not.toContain("Health: needs follow up");
  });
});

describe("the shared health-status label map (#478)", () => {
  it("speaks the CONTEXT.md vocabulary for every status", () => {
    expect(GROUP_HEALTH_STATUS_LABEL).toEqual({
      healthy: "Healthy",
      watch: "Watch",
      needs_follow_up: "Needs follow-up",
      healthy_paused: "Healthy (paused)",
      restart_soon: "Restart soon",
      overdue_restart: "Overdue restart",
      capacity_full: "Capacity full",
      needs_leader_support: "Needs shepherd support",
    });
  });

  it("labels a single status canonically", () => {
    expect(groupHealthStatusLabel("needs_follow_up")).toBe("Needs follow-up");
  });
});
