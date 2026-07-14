import { describe, expect, it } from "vitest";
import {
  buildSuperAdminConsoleStatus,
  computeNextAction,
  formatStatusTime,
  LEGACY_HASH_ALIASES,
  listAccountStatusProfiles,
  resolveSuperAdminWorkspaceId,
  SUPER_ADMIN_WORKSPACE_IDS,
  type SuperAdminTestAccountsSummary,
} from "@/lib/admin/super-admin-console-model";

const DISABLED_TEST_ACCOUNTS: SuperAdminTestAccountsSummary = {
  label: "Disabled",
  tone: "good",
  description: "Test accounts are off.",
};

function baseInput() {
  return {
    errors: { audit: null, profiles: null, platformConfig: null } as Record<
      string,
      string | null
    >,
    checklist: [] as { tone: string }[],
    profiles: [] as { status: "active" | "inactive" | "invited" }[],
    latestAuditEventAt: null as string | null,
    auditEventCount: null as number | null,
    featureFlags: {},
    testAccountsSummary: DISABLED_TEST_ACCOUNTS,
  };
}

describe("buildSuperAdminConsoleStatus", () => {
  it("reads launch-ready when nothing needs attention", () => {
    const status = buildSuperAdminConsoleStatus(baseInput());
    expect(status.errorCount).toBe(0);
    expect(status.checklistWarningCount).toBe(0);
    expect(status.readinessLabel).toBe("Good");
    expect(status.readinessTone).toBe("good");
    expect(status.nextAction.title).toBe("You’re launch-ready");
    expect(status.nextAction.tone).toBe("good");
    expect(status.nextAction.action).toBeUndefined();

    const readiness = status.chips[0];
    expect(readiness.detail).toBe("No warnings or load errors");
    expect(readiness.action).toBeUndefined();
  });

  it("keeps the status-row chips in display order", () => {
    const status = buildSuperAdminConsoleStatus(baseInput());
    expect(status.chips.map((chip) => chip.label)).toEqual([
      "Readiness",
      "Access",
      "Test accounts",
      "Last audit event",
      "Danger actions",
      "Usage tracking",
    ]);
  });

  it("degrades to a warning on a failed read instead of a false Good", () => {
    const status = buildSuperAdminConsoleStatus({
      ...baseInput(),
      errors: { audit: "boom", profiles: null },
    });
    expect(status.errorCount).toBe(1);
    expect(status.readinessLabel).toBe("Warning");
    expect(status.readinessTone).toBe("warning");
    const readiness = status.chips[0];
    expect(readiness.detail).toBe("0 warnings · 1 load error");
    expect(readiness.action).toEqual({
      label: "Open Diagnostics",
      hash: "diagnostics",
    });
    expect(status.nextAction.title).toBe("Resolve load errors");
  });

  it("counts only warn checklist rows and pluralizes the detail", () => {
    const status = buildSuperAdminConsoleStatus({
      ...baseInput(),
      checklist: [{ tone: "warn" }, { tone: "ok" }, { tone: "warn" }],
    });
    expect(status.checklistWarningCount).toBe(2);
    expect(status.chips[0].detail).toBe("2 warnings · 0 load errors");
    expect(status.nextAction.title).toBe("Finish readiness setup");
    expect(status.nextAction.body).toContain("2 readiness checks");
  });

  it("counts active profiles only and uses the singular form", () => {
    const status = buildSuperAdminConsoleStatus({
      ...baseInput(),
      profiles: [
        { status: "active" },
        { status: "inactive" },
        { status: "invited" },
      ],
    });
    expect(status.activeProfiles).toBe(1);
    expect(status.chips[1].detail).toBe("1 active profile");
  });

  it("summarises the test-account state with its next best action", () => {
    const status = buildSuperAdminConsoleStatus({
      ...baseInput(),
      testAccountsSummary: {
        label: "Active",
        tone: "warning",
        description: "Known-password accounts are live.",
      },
    });
    const chip = status.chips[2];
    expect(chip.value).toBe("Active");
    expect(chip.detail).toBe("Known passwords are live: disable before launch");
    expect(chip.action).toEqual({
      label: "Review test accounts",
      hash: "test-tools",
    });
    expect(status.nextAction.title).toBe("Disable test accounts before launch");
  });

  it("never reads an unconfirmed test-account state as launch-ready", () => {
    const status = buildSuperAdminConsoleStatus({
      ...baseInput(),
      testAccountsSummary: {
        label: "Unknown",
        tone: "warning",
        description: "Status check returned no clear answer.",
      },
    });
    expect(status.chips[2].detail).toBe(
      "Couldn’t confirm whether test accounts are off"
    );
    expect(status.chips[2].action).toEqual({
      label: "Open Diagnostics",
      hash: "test-tools",
    });
    expect(status.nextAction.title).toBe("Confirm test-account status");
  });

  it("describes the last audit event with its running total", () => {
    const status = buildSuperAdminConsoleStatus({
      ...baseInput(),
      latestAuditEventAt: "2026-01-05T12:30:00Z",
      auditEventCount: 42,
    });
    const chip = status.chips[3];
    expect(chip.value).toBe("Recorded");
    expect(chip.tone).toBe("active");
    expect(chip.detail).toBe("Jan 5, 2026, 12:30 PM UTC · 42 total");
    expect(chip.action).toEqual({ label: "Open Audit", hash: "audit" });
  });

  it("drops the running total when the audit count read failed", () => {
    const status = buildSuperAdminConsoleStatus({
      ...baseInput(),
      latestAuditEventAt: "2026-01-05T12:30:00Z",
      auditEventCount: null,
    });
    expect(status.chips[3].detail).toBe("Jan 5, 2026, 12:30 PM UTC");
  });

  it("reads None with no action before any audit event exists", () => {
    const chip = buildSuperAdminConsoleStatus(baseInput()).chips[3];
    expect(chip.value).toBe("None");
    expect(chip.tone).toBe("planned");
    expect(chip.detail).toBe("No actions recorded yet");
    expect(chip.action).toBeUndefined();
  });

  it("resolves the usage-tracking flag for the Usage chip", () => {
    const off = buildSuperAdminConsoleStatus(baseInput());
    expect(off.usageTrackingOn).toBe(false);
    expect(off.chips[5].value).toBe("Off");
    expect(off.chips[5].detail).toBe("Off: nothing is recorded");

    const on = buildSuperAdminConsoleStatus({
      ...baseInput(),
      featureFlags: { usage_tracking: { enabled: true } },
    });
    expect(on.usageTrackingOn).toBe(true);
    expect(on.chips[5].value).toBe("On");
    expect(on.chips[5].detail).toBe("Recording logins + area views");
  });

  it("links the Usage chip to its workspace regardless of flag state", () => {
    const action = { label: "Open Usage", hash: "usage" };
    expect(buildSuperAdminConsoleStatus(baseInput()).chips[5].action).toEqual(
      action
    );
    expect(
      buildSuperAdminConsoleStatus({
        ...baseInput(),
        featureFlags: { usage_tracking: { enabled: true } },
      }).chips[5].action
    ).toEqual(action);
  });
});

describe("computeNextAction precedence", () => {
  const base = {
    errorCount: 0,
    checklistWarningCount: 0,
    testAccountsSummary: DISABLED_TEST_ACCOUNTS,
  };

  it("puts load errors above everything else", () => {
    const action = computeNextAction({
      ...base,
      errorCount: 1,
      checklistWarningCount: 3,
      testAccountsSummary: {
        label: "Active",
        tone: "warning",
        description: "",
      },
    });
    expect(action.title).toBe("Resolve load errors");
    expect(action.action).toBeUndefined();
  });

  it("puts a blocked status check above an active test account", () => {
    // A blocked check means the Active/Disabled answer can't be trusted, so
    // fixing the tooling comes first.
    const action = computeNextAction({
      ...base,
      testAccountsSummary: {
        label: "Active",
        tone: "blocked",
        description: "",
      },
    });
    expect(action.title).toBe("Check test-account tooling");
    expect(action.action).toEqual({
      label: "Open Diagnostics",
      hash: "test-tools",
    });
  });

  it("puts active test accounts above readiness warnings", () => {
    const action = computeNextAction({
      ...base,
      checklistWarningCount: 2,
      testAccountsSummary: {
        label: "Active",
        tone: "warning",
        description: "",
      },
    });
    expect(action.title).toBe("Disable test accounts before launch");
  });

  it("uses the singular readiness-check form", () => {
    const action = computeNextAction({ ...base, checklistWarningCount: 1 });
    expect(action.body).toContain("1 readiness check need attention.");
  });
});

describe("workspace deep-link aliases", () => {
  it("maps every legacy anchor to a workspace the rail renders", () => {
    const ids = new Set<string>(SUPER_ADMIN_WORKSPACE_IDS);
    for (const target of Object.values(LEGACY_HASH_ALIASES)) {
      expect(ids.has(target)).toBe(true);
    }
  });

  it("never shadows a workspace id with an alias key", () => {
    // The switcher resolves a direct workspace-id hash first, so an alias key
    // equal to a workspace id would be dead weight (or worse, misleading).
    const ids = new Set<string>(SUPER_ADMIN_WORKSPACE_IDS);
    for (const alias of Object.keys(LEGACY_HASH_ALIASES)) {
      expect(ids.has(alias)).toBe(false);
    }
  });

  it("keeps the documented deep links pointing at their hosts", () => {
    expect(LEGACY_HASH_ALIASES["people-import"]).toBe("access");
    expect(LEGACY_HASH_ALIASES["test-tools"]).toBe("diagnostics");
    expect(LEGACY_HASH_ALIASES["danger-zone"]).toBe("danger");
    expect(LEGACY_HASH_ALIASES["overview"]).toBe("readiness");
  });
  it("accepts only declared server-visible workspace query values", () => {
    expect(resolveSuperAdminWorkspaceId("danger")).toBe("danger");
    expect(resolveSuperAdminWorkspaceId(["usage", "danger"])).toBe("usage");
    expect(resolveSuperAdminWorkspaceId("unknown")).toBe("readiness");
    expect(resolveSuperAdminWorkspaceId(undefined)).toBe("readiness");
  });

  it("hosts usage as its own workspace, with #activity aliased to it", () => {
    expect(SUPER_ADMIN_WORKSPACE_IDS).toContain("usage");
    expect(LEGACY_HASH_ALIASES["activity"]).toBe("usage");
  });
});

describe("listAccountStatusProfiles", () => {
  it("excludes the super admin and sorts by name", () => {
    const profiles = new Map([
      ["1", { role: "leader" as const, full_name: "Zoe Park" }],
      ["2", { role: "super_admin" as const, full_name: "Tom Owner" }],
      ["3", { role: "ministry_admin" as const, full_name: "Julian Reyes" }],
      ["4", { role: "over_shepherd" as const, full_name: "Amos Lee" }],
    ]);
    expect(listAccountStatusProfiles(profiles).map((p) => p.full_name)).toEqual(
      ["Amos Lee", "Julian Reyes", "Zoe Park"]
    );
  });
});

describe("formatStatusTime", () => {
  it("renders a fixed en-US UTC stamp", () => {
    expect(formatStatusTime("2026-01-05T12:30:00Z")).toBe(
      "Jan 5, 2026, 12:30 PM"
    );
  });

  it("passes an unparseable value through unchanged", () => {
    expect(formatStatusTime("not-a-date")).toBe("not-a-date");
  });
});
