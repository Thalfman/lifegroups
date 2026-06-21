import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(protected)/admin/groups/actions", () => ({
  adminCreateGroup: vi.fn(),
}));

import { GroupCreateForm } from "@/components/admin/forms/group-create-form";

const GROUP_TYPES = ["Married Couples", "Young Adults"];

describe("GroupCreateForm", () => {
  it("disables Create group until a group name is entered", () => {
    const html = renderToStaticMarkup(
      <GroupCreateForm defaultCapacity={12} groupTypes={GROUP_TYPES} />
    );

    expect(html).toContain("Enter a group name to enable Create group.");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Create group<\/button>/);
  });

  it("offers the group-type list plus a creatable add-new affordance (#776 OPP-3)", () => {
    const html = renderToStaticMarkup(
      <GroupCreateForm defaultCapacity={12} groupTypes={GROUP_TYPES} />
    );

    // The creatable picker: a "—" no-selection option, the admin-managed types,
    // and the in-place "Add new type" affordance (replacing the old plain
    // <select> with its "Untyped" option).
    expect(html).toContain("Married Couples");
    expect(html).toContain("Young Adults");
    expect(html).toContain("Add new type");
    expect(html).toContain('name="group_type"');
  });
});
