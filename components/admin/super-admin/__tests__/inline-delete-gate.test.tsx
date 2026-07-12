import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The inline-delete control calls usePathname() and the super-admin server
// actions. The gate this suite asserts is render-time (does the Delete trigger
// appear?), so stub the router + actions — neither runs under static markup.
vi.mock("next/navigation", () => ({ usePathname: () => "/admin/care" }));
vi.mock("@/app/(protected)/admin/super-admin/permanent-delete-actions", () => ({
  superAdminInlineDelete: vi.fn(),
  superAdminPermanentDeletePreflight: vi.fn(),
}));

import { CareItemList } from "@/components/admin/care/care-item-list";
import {
  DeletePreview,
  DeleteSuccessNotice,
} from "@/components/admin/super-admin/inline-delete";
import type { CareItem } from "@/lib/admin/care-area";
import type { DeletionPreflight } from "@/lib/admin/danger-zone";

// A Care follow-up row carries a deletable DB target; a derived needs-contact
// aggregate does not (deleteTarget: null).
function careItem(overrides: Partial<CareItem> = {}): CareItem {
  return {
    key: "fu-1",
    personName: "Jane Leader",
    reason: "Follow-up due soon",
    groupName: null,
    dueLabel: null,
    dueTone: "neutral",
    ownerName: null,
    actionLabel: "Resolve follow-up",
    actionAccessibleName: "Resolve follow-up for Jane Leader",
    actionHref: "/admin/shepherd-care/leader-1?tab=follow-ups",
    deleteTarget: { entityType: "shepherd_care_follow_up", id: "fu-uuid" },
    ...overrides,
  };
}

const LIST_PROPS = {
  emptyTitle: "No care follow-ups due soon",
  emptyDescription: "No care follow-ups due soon.",
};

describe("SuperAdminInlineDelete render gate (via CareItemList)", () => {
  it("shows the Delete trigger only for a super admin with a delete target", () => {
    const html = renderToStaticMarkup(
      <CareItemList items={[careItem()]} {...LIST_PROPS} isSuperAdmin />
    );
    expect(html).toContain('data-testid="inline-delete"');
  });

  it("hides the Delete trigger for a non-super-admin", () => {
    const html = renderToStaticMarkup(
      <CareItemList items={[careItem()]} {...LIST_PROPS} isSuperAdmin={false} />
    );
    expect(html).not.toContain('data-testid="inline-delete"');
  });

  it("hides the Delete trigger by default (isSuperAdmin omitted)", () => {
    const html = renderToStaticMarkup(
      <CareItemList items={[careItem()]} {...LIST_PROPS} />
    );
    expect(html).not.toContain('data-testid="inline-delete"');
  });

  it("hides the Delete trigger for a super admin when the row has no delete target", () => {
    const html = renderToStaticMarkup(
      <CareItemList
        items={[careItem({ deleteTarget: null })]}
        {...LIST_PROPS}
        isSuperAdmin
      />
    );
    expect(html).not.toContain('data-testid="inline-delete"');
  });
});

// The "Super admin only" mark lives inside the inline-delete control, so it
// appears exactly when the Delete trigger does — flagging the control as private
// to the super admin. It must never render for any other role.
describe("SuperAdminOnlyMark on the inline delete", () => {
  it("marks the Delete control for a super admin with a delete target", () => {
    const html = renderToStaticMarkup(
      <CareItemList items={[careItem()]} {...LIST_PROPS} isSuperAdmin />
    );
    expect(html).toContain('data-testid="super-admin-only-mark"');
    expect(html).toContain("Super Admin only");
    expect(html).not.toContain("hidden from other roles");
  });

  it("shows no mark for a non-super-admin", () => {
    const html = renderToStaticMarkup(
      <CareItemList items={[careItem()]} {...LIST_PROPS} isSuperAdmin={false} />
    );
    expect(html).not.toContain('data-testid="super-admin-only-mark"');
  });

  it("shows no mark for a super admin when the row has no delete target", () => {
    const html = renderToStaticMarkup(
      <CareItemList
        items={[careItem({ deleteTarget: null })]}
        {...LIST_PROPS}
        isSuperAdmin
      />
    );
    expect(html).not.toContain('data-testid="super-admin-only-mark"');
  });
});

describe("inline delete success notice", () => {
  it("does not describe an irreversible profile erasure as recoverable", () => {
    const html = renderToStaticMarkup(
      <DeleteSuccessNotice entityType="profile" />
    );

    expect(html).toContain("Profile erased");
    expect(html).toContain("no recovery copy");
    expect(html).not.toContain("Recoverable from a backup");
  });

  it("keeps the recovery notice for non-profile deletions", () => {
    const html = renderToStaticMarkup(
      <DeleteSuccessNotice entityType="group" />
    );

    expect(html).toContain("Deleted. Recoverable from a backup.");
  });
});

// The popover's preview states. The panel only mounts when Radix opens it, so
// these render DeletePreview (exported for exactly this) directly. #880: a
// deletable report with a non-empty cleanup bucket must ANNOUNCE the
// assignment-record removal (kept in the backup copy, not re-created on
// restore) instead of a bare "Safe to delete" — inform the delete, not block it.
describe("DeletePreview cleanup announcement (#880)", () => {
  function report(
    overrides: Partial<DeletionPreflight> = {}
  ): DeletionPreflight {
    return {
      entityType: "profile",
      entityId: "22222222-2222-2222-2222-222222222222",
      deletable: true,
      confidential: false,
      forbidden: false,
      blockers: [],
      setNull: [],
      cleanup: [],
      ...overrides,
    };
  }

  function render(r: DeletionPreflight): string {
    return renderToStaticMarkup(
      <DeletePreview
        pending={false}
        failed={false}
        report={r}
        onRetry={() => {}}
      />
    );
  }

  it("announces the assignment cleanup on a deletable report with cleanup entries", () => {
    const html = render(
      report({
        cleanup: [
          { table: "group_leaders", column: "profile_id", count: 1 },
          {
            table: "shepherd_coverage_assignments",
            column: "shepherd_profile_id",
            count: 2,
          },
        ],
      })
    );
    expect(html).toContain("Will permanently remove 3 assignment records");
    expect(html).toContain("No recovery copy will be retained");
    // Still safe to delete — the cleanup informs, it never blocks.
    expect(html).toContain("Ready for irreversible profile erasure.");
  });

  it("singularizes a one-record cleanup", () => {
    const html = render(
      report({
        cleanup: [{ table: "group_leaders", column: "profile_id", count: 1 }],
      })
    );
    expect(html).toContain("Will permanently remove 1 assignment record.");
  });

  it("keeps recovery copy for a non-profile deletion", () => {
    const html = render(report({ entityType: "group" }));
    expect(html).toContain("Safe to delete.");
    expect(html).toContain("A backup copy is captured first");
    expect(html).not.toContain("Will remove and back up");
  });

  it("keeps blockers ahead of the cleanup announcement", () => {
    const html = render(
      report({
        deletable: false,
        blockers: [
          {
            table: "group_memberships",
            column: "group_id",
            action: "c",
            count: 2,
            ids: [],
            entityType: "group_membership",
          },
        ],
        cleanup: [{ table: "group_leaders", column: "profile_id", count: 1 }],
      })
    );
    expect(html).toContain("Blocked by 2 dependents");
    expect(html).not.toContain("Safe to delete.");
  });
});
