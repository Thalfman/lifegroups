import type { StatusTone } from "@/components/admin/console-status";
import {
  resolveFlag,
  type FeatureFlagsConfig,
} from "@/lib/admin/feature-flags";
import type { ProfilesRow } from "@/types/database";

// Pure derived-view model for the Super Admin Console shell
// (components/admin/super-admin-console-shell.tsx). The status-row chips, the
// Next-step card, the workspace/deep-link alias table, and the Account-status
// list are computed here so their branching is unit-testable without
// rendering. No I/O and no React — the shell loads the data and passes it in.

// The console's workspace tabs, in rail order. Ids double as URL hashes; the
// Danger Zone stays last so the destructive tab can't read as a default.
export const SUPER_ADMIN_WORKSPACE_IDS = [
  "readiness",
  "access",
  "config",
  "diagnostics",
  "audit",
  "usage",
  "danger",
] as const;

export type SuperAdminWorkspaceId = (typeof SUPER_ADMIN_WORKSPACE_IDS)[number];

export function resolveSuperAdminWorkspaceId(
  raw: string | string[] | undefined
): SuperAdminWorkspaceId {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return SUPER_ADMIN_WORKSPACE_IDS.includes(value as SuperAdminWorkspaceId)
    ? (value as SuperAdminWorkspaceId)
    : "readiness";
}

// Section-id hash → the workspace that hosts it, so a deep link (e.g. Settings'
// "Open import" → /admin/super-admin#people-import, or a copied section-nav
// link) opens the right workspace before scrolling — only the active workspace
// panel mounts, so a hash into an unopened workspace would otherwise be a dead
// anchor. Covers the old console's legacy anchors plus the section-nav ids.
// Typed against SuperAdminWorkspaceId so an alias can never name a workspace
// the rail doesn't render; the switcher itself resolves direct ids first
// (components/admin/super-admin-console.tsx), so alias keys must not shadow a
// workspace id.
export const LEGACY_HASH_ALIASES: Record<string, SuperAdminWorkspaceId> = {
  overview: "readiness",
  "change-role": "access",
  invite: "access",
  "account-status": "access",
  "people-import": "access",
  coverage: "access",
  features: "config",
  settings: "config",
  "ministry-settings": "config",
  "test-tools": "diagnostics",
  maintenance: "diagnostics",
  activity: "usage",
  "danger-zone": "danger",
};

export type SuperAdminTestAccountsSummary = {
  label: string;
  tone: StatusTone;
  description: string;
};

// A "go do it" target inside a status card, wired through the existing
// #hash → workspace mechanism (#454) — no new navigation machinery.
export type ConsoleStatusAction = { label: string; hash: string };

// One chip in the always-visible status row: a sentence-case label, a status
// value + tone, a one-line detail (the plain-language reason when something is
// blocked), and — when the state needs attention — the next best action (#454).
export type ConsoleStatusChip = {
  label: string;
  value: string;
  tone: StatusTone;
  detail: string;
  action?: ConsoleStatusAction;
};

export type SuperAdminNextAction = {
  title: string;
  body: string;
  tone: StatusTone;
  // The obvious next click. Absent when there's nothing to open
  // (e.g. launch-ready).
  action?: ConsoleStatusAction;
};

// The single most important thing to do right now, derived from the same
// signals the status row uses. Surfaced at the top of the Readiness dashboard
// so the operator isn't left to scan for what matters.
export function computeNextAction(input: {
  errorCount: number;
  checklistWarningCount: number;
  testAccountsSummary: SuperAdminTestAccountsSummary;
}): SuperAdminNextAction {
  const { errorCount, checklistWarningCount, testAccountsSummary } = input;
  if (errorCount > 0) {
    return {
      title: "Resolve load errors",
      body: "Some data couldn’t be read. Check the database connection, then reload this page.",
      tone: "warning",
    };
  }
  if (testAccountsSummary.tone === "blocked") {
    return {
      title: "Check test-account tooling",
      body: "The test-account status check came back blocked. Open Diagnostics → Test tools to look into it.",
      tone: "warning",
      action: { label: "Open Diagnostics", hash: "test-tools" },
    };
  }
  if (testAccountsSummary.label === "Active") {
    return {
      title: "Disable test accounts before launch",
      body: "Known-password test accounts are still enabled. Turn them off in Diagnostics → Test tools before going live.",
      tone: "warning",
      action: { label: "Review test accounts", hash: "test-tools" },
    };
  }
  // Any remaining non-good test-account status (e.g. "Unknown" when the status
  // check didn't return a clear answer) must not read as launch-ready, since we
  // can't confirm the known-password accounts are off.
  if (testAccountsSummary.tone !== "good") {
    return {
      title: "Confirm test-account status",
      body: "Couldn’t confirm whether known-password test accounts are disabled. Check Diagnostics → Test tools before launch.",
      tone: "warning",
      action: { label: "Open Diagnostics", hash: "test-tools" },
    };
  }
  if (checklistWarningCount > 0) {
    return {
      title: "Finish readiness setup",
      body: `${checklistWarningCount} readiness check${
        checklistWarningCount === 1 ? "" : "s"
      } need attention. Review them in Diagnostics.`,
      tone: "warning",
      action: { label: "Open Diagnostics", hash: "diagnostics" },
    };
  }
  return {
    title: "You’re launch-ready",
    body: "No outstanding readiness items. Day-to-day ministry work happens in /admin and /leader.",
    tone: "good",
  };
}

// Fixed locale + UTC so the server-rendered status row matches whatever a later
// re-render would produce (no hydration drift). Mirrors the danger cards.
export function formatStatusTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    timeZone: "UTC",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export type SuperAdminConsoleStatus = {
  errorCount: number;
  checklistWarningCount: number;
  activeProfiles: number;
  readinessTone: StatusTone;
  readinessLabel: string;
  usageTrackingOn: boolean;
  nextAction: SuperAdminNextAction;
  // The status-row chips, in display order: Readiness, Access, Test accounts,
  // Last audit event, Danger actions, Usage tracking.
  chips: ConsoleStatusChip[];
};

// Derives the console's whole status surface from the loaded reads. A failed
// read degrades to a warning (never a false "Good"), and any unconfirmed
// test-account state must not read as launch-ready.
export function buildSuperAdminConsoleStatus(input: {
  errors: Record<string, string | null>;
  checklist: readonly { tone: string }[];
  profiles: Iterable<Pick<ProfilesRow, "status">>;
  // created_at of the newest loaded audit event, or null when none loaded.
  latestAuditEventAt: string | null;
  auditEventCount: number | null;
  featureFlags: FeatureFlagsConfig;
  testAccountsSummary: SuperAdminTestAccountsSummary;
}): SuperAdminConsoleStatus {
  const {
    latestAuditEventAt,
    auditEventCount,
    featureFlags,
    testAccountsSummary,
  } = input;

  const errorCount = Object.values(input.errors).filter(Boolean).length;
  const checklistWarningCount = input.checklist.filter(
    (row) => row.tone === "warn"
  ).length;
  const readinessTone: StatusTone =
    errorCount > 0 || checklistWarningCount > 0 ? "warning" : "good";
  const readinessLabel = readinessTone === "good" ? "Good" : "Warning";

  let activeProfiles = 0;
  for (const profile of input.profiles) {
    if (profile.status === "active") activeProfiles += 1;
  }

  const usageTrackingOn = resolveFlag(featureFlags, "usage_tracking");
  const nextAction = computeNextAction({
    errorCount,
    checklistWarningCount,
    testAccountsSummary,
  });

  const chips: ConsoleStatusChip[] = [
    {
      label: "Readiness",
      value: readinessLabel,
      tone: readinessTone,
      detail:
        readinessTone === "good"
          ? "No warnings or load errors"
          : `${checklistWarningCount} warning${
              checklistWarningCount === 1 ? "" : "s"
            } · ${errorCount} load error${errorCount === 1 ? "" : "s"}`,
      action:
        readinessTone === "good"
          ? undefined
          : { label: "Open Diagnostics", hash: "diagnostics" },
    },
    {
      label: "Access",
      value: "Guarded",
      tone: "guarded",
      detail: `${activeProfiles} active profile${
        activeProfiles === 1 ? "" : "s"
      }`,
    },
    {
      label: "Test accounts",
      value: testAccountsSummary.label,
      tone: testAccountsSummary.tone,
      detail:
        testAccountsSummary.label === "Active"
          ? "Known passwords are live: disable before launch"
          : testAccountsSummary.label === "Disabled"
            ? "Not enabled"
            : testAccountsSummary.label === "Blocked"
              ? "The status check couldn’t run"
              : "Couldn’t confirm whether test accounts are off",
      action:
        testAccountsSummary.label === "Disabled"
          ? undefined
          : testAccountsSummary.label === "Active"
            ? { label: "Review test accounts", hash: "test-tools" }
            : { label: "Open Diagnostics", hash: "test-tools" },
    },
    {
      label: "Last audit event",
      value: latestAuditEventAt ? "Recorded" : "None",
      tone: latestAuditEventAt ? "active" : "planned",
      detail: latestAuditEventAt
        ? `${formatStatusTime(latestAuditEventAt)} UTC${
            auditEventCount != null ? ` · ${auditEventCount} total` : ""
          }`
        : "No actions recorded yet",
      action: latestAuditEventAt
        ? { label: "Open Audit", hash: "audit" }
        : undefined,
    },
    {
      label: "Danger actions",
      value: "Locked",
      tone: "guarded",
      detail: "Type-to-confirm on every action",
    },
    {
      label: "Usage tracking",
      value: usageTrackingOn ? "On" : "Off",
      tone: usageTrackingOn ? "active" : "planned",
      detail: usageTrackingOn
        ? "Recording logins + area views"
        : "Off: nothing is recorded",
      action: { label: "Open Usage", hash: "usage" },
    },
  ];

  return {
    errorCount,
    checklistWarningCount,
    activeProfiles,
    readinessTone,
    readinessLabel,
    usageTrackingOn,
    nextAction,
    chips,
  };
}

// Account-status list: every loaded profile except the bootstrap super_admin
// (which the RPC also refuses), alphabetical by name. The actor's own profile
// stays listed — disabling yourself is guarded server-side, not hidden here.
export function listAccountStatusProfiles<
  T extends Pick<ProfilesRow, "role" | "full_name">,
>(profilesById: ReadonlyMap<string, T>): T[] {
  return Array.from(profilesById.values())
    .filter((p) => p.role !== "super_admin")
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}
