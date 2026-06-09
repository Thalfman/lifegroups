import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The six confirm-action configs bind "use server" actions; stub the modules
// so static rendering never pulls server-only deps (the markup never invokes
// the actions anyway).
vi.mock("@/app/(protected)/admin/groups/actions", () => ({
  adminCloseGroup: vi.fn(),
  adminReopenGroup: vi.fn(),
}));
vi.mock("@/app/(protected)/admin/people/actions", () => ({
  adminDeactivateProfile: vi.fn(),
  adminDeactivateMember: vi.fn(),
}));
vi.mock("@/app/(protected)/admin/settings/actions", () => ({
  adminUpsertGroupMetricSettings: vi.fn(),
  adminResetMetricDefaults: vi.fn(),
}));

import {
  ArchiveGroupButton,
  archiveGroupConfirmMessage,
} from "@/components/admin/forms/archive-group-button";
import {
  RestoreGroupButton,
  restoreGroupConfirmMessage,
} from "@/components/admin/forms/restore-group-button";
import {
  DeactivateProfileButton,
  deactivateProfileConfirmMessage,
} from "@/components/admin/forms/deactivate-profile-button";
import {
  DeactivateMemberButton,
  deactivateMemberConfirmMessage,
} from "@/components/admin/forms/deactivate-member-button";
import {
  ClearGroupMetricOverridesButton,
  clearGroupMetricOverridesConfirmMessage,
} from "@/components/admin/forms/clear-group-metric-overrides-button";
import {
  ResetMetricDefaultsButton,
  resetMetricDefaultsConfirmMessage,
} from "@/components/admin/forms/reset-metric-defaults-button";

// #489 collapsed six hand-wired button modules into configs of one deep
// ConfirmActionButton. The user-facing strings must stay byte-identical to
// the pre-#489 modules — these literals are the catalog taken from them.
describe("confirmation copy — byte-identical to the pre-#489 modules", () => {
  it("Archive group", () => {
    expect(archiveGroupConfirmMessage("Bayside Men")).toBe(
      "Archive Bayside Men? It'll come off the active roster and move to the archive. Everything stays in the record and you can restore it later."
    );
    expect(archiveGroupConfirmMessage()).toBe(
      "Archive this group? It'll come off the active roster and move to the archive. Everything stays in the record and you can restore it later."
    );
  });

  it("Restore group", () => {
    expect(restoreGroupConfirmMessage("Bayside Men")).toBe(
      "Restore Bayside Men? It'll move back to the active roster."
    );
    expect(restoreGroupConfirmMessage()).toBe(
      "Restore this group? It'll move back to the active roster."
    );
  });

  it("Deactivate profile", () => {
    expect(deactivateProfileConfirmMessage("Jane Leader")).toBe(
      "Deactivate Jane Leader? Their leader assignments will also be closed."
    );
    expect(deactivateProfileConfirmMessage()).toBe(
      "Deactivate this profile? Their leader assignments will also be closed."
    );
  });

  it("Deactivate member", () => {
    expect(deactivateMemberConfirmMessage("Sam Member")).toBe(
      "Deactivate Sam Member? Their active group memberships will be closed today."
    );
    expect(deactivateMemberConfirmMessage()).toBe(
      "Deactivate this member? Their active group memberships will be closed today."
    );
  });

  it("Clear group metric overrides", () => {
    expect(clearGroupMetricOverridesConfirmMessage("Bayside Men")).toBe(
      "Clear all metric overrides on Bayside Men? It'll fall back to the global defaults."
    );
  });

  it("Reset metric defaults", () => {
    expect(resetMetricDefaultsConfirmMessage).toBe(
      "Restore the built-in metric defaults?\n\n" +
        "This resets the global thresholds (capacity, healthy attendance, " +
        "check-in due offset, missed check-in window) to their baseline " +
        "values. Per-group overrides are NOT touched — clear those " +
        "separately from the overrides list below if you also want them " +
        "cleared. This action is audited."
    );
  });
});

describe("six configs — labels, aria-labels, and hidden fields", () => {
  it("ArchiveGroupButton serializes group_id with the original labels", () => {
    const html = renderToStaticMarkup(
      <ArchiveGroupButton groupId="g1" groupName="Bayside Men" />
    );
    expect(html).toContain('name="group_id"');
    expect(html).toContain('value="g1"');
    expect(html).toContain('aria-label="Archive Bayside Men"');
    expect(html).toContain(">Archive group</button>");
  });

  it("ArchiveGroupButton omits the aria-label when no group name is given", () => {
    const html = renderToStaticMarkup(<ArchiveGroupButton groupId="g1" />);
    expect(html).not.toContain("aria-label");
    expect(html).toContain(">Archive group</button>");
  });

  it("RestoreGroupButton passes the record-context aria-label through", () => {
    const html = renderToStaticMarkup(
      <RestoreGroupButton
        groupId="g1"
        groupName="Bayside Men"
        ariaLabel="Restore Bayside Men · North"
      />
    );
    expect(html).toContain('name="group_id"');
    expect(html).toContain('value="g1"');
    expect(html).toContain('aria-label="Restore Bayside Men · North"');
    expect(html).toContain(">Restore group</button>");
  });

  it("DeactivateProfileButton names the person in the aria-label", () => {
    const html = renderToStaticMarkup(
      <DeactivateProfileButton profileId="p1" fullName="Jane Leader" />
    );
    expect(html).toContain('name="profile_id"');
    expect(html).toContain('value="p1"');
    expect(html).toContain('aria-label="Deactivate Jane Leader"');
    expect(html).toContain(">Deactivate</button>");
  });

  it("DeactivateMemberButton names the person in the aria-label", () => {
    const html = renderToStaticMarkup(
      <DeactivateMemberButton memberId="m1" fullName="Sam Member" />
    );
    expect(html).toContain('name="member_id"');
    expect(html).toContain('value="m1"');
    expect(html).toContain('aria-label="Deactivate Sam Member"');
    expect(html).toContain(">Deactivate</button>");
  });

  it("ClearGroupMetricOverridesButton serializes every override field as cleared", () => {
    const html = renderToStaticMarkup(
      <ClearGroupMetricOverridesButton groupId="g1" groupName="Bayside Men" />
    );
    expect(html).toContain('name="group_id"');
    expect(html).toContain('name="capacity_override"');
    expect(html).toContain('name="capacity_warning_threshold_pct_override"');
    expect(html).toContain('name="healthy_attendance_pct_override"');
    expect(html).toContain('name="manual_health_status_override"');
    expect(html).toContain('value="none"');
    expect(html).toContain('name="admin_metric_notes"');
    // Intentionally not submitted so the server action reads it as `false`
    // (browsers omit unchecked checkboxes).
    expect(html).not.toContain('name="exclude_from_capacity_metrics"');
    expect(html).toContain(">Clear overrides</button>");
  });

  it("ResetMetricDefaultsButton keeps the helper copy and submits no fields", () => {
    const html = renderToStaticMarkup(<ResetMetricDefaultsButton />);
    expect(html).not.toContain('type="hidden"');
    expect(html).toContain(">Reset defaults</button>");
    expect(html).toContain("Per-group overrides stay intact");
  });
});
