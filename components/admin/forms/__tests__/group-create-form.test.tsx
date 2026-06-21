import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(protected)/admin/groups/actions", () => ({
  adminCreateGroup: vi.fn(),
}));

// The group-type picker's "Manage group types" hand-off (#781 OPP-3b) reads the
// App Router; stub it so the form renders in these tests.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
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

  // #781 OPP-3b — the restore half of the "Manage group types" round trip: a
  // returned draft seeds every field and opens More details so nothing is hidden.
  it("restores a returned draft into its fields", () => {
    const html = renderToStaticMarkup(
      <GroupCreateForm
        defaultCapacity={12}
        groupTypes={GROUP_TYPES}
        draft={{
          name: "Wednesday Westside",
          meeting_frequency: "biweekly",
          location_area: "Westside",
          capacity: "9",
          group_type: "Young Adults",
        }}
      />
    );

    expect(html).toContain('value="Wednesday Westside"');
    expect(html).toContain('value="Westside"');
    expect(html).toContain('value="9"');
    // The name is enabled now (a draft carries a name), so Create is not disabled
    // for a missing name.
    expect(html).not.toContain("Enter a group name to enable Create group.");
  });
});
