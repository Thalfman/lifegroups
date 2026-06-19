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

  it("offers the group-type list plus an Untyped option", () => {
    const html = renderToStaticMarkup(
      <GroupCreateForm defaultCapacity={12} groupTypes={GROUP_TYPES} />
    );

    expect(html).toContain("Untyped");
    expect(html).toContain("Married Couples");
    expect(html).toContain("Young Adults");
  });
});
