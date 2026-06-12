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
import type { CareItem } from "@/lib/admin/care-area";

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
