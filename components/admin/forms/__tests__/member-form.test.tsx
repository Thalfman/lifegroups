import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The form binds a "use server" action; stub the module so static rendering
// never pulls server-only deps (the markup never invokes the action anyway).
vi.mock("@/app/(protected)/admin/people/actions", () => ({
  adminCreateMember: vi.fn(),
  adminAddPersonToGroup: vi.fn(),
}));

import { MemberForm } from "@/components/admin/forms/member-form";

describe("MemberForm", () => {
  it("disables Add member until a full name is entered", () => {
    const html = renderToStaticMarkup(<MemberForm />);

    expect(html).toContain("Enter a full name to enable Add member.");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Add member<\/button>/);
  });

  it("in group mode carries group_id + kind and renames the action (#643)", () => {
    const html = renderToStaticMarkup(
      <MemberForm
        assignToGroup={{ groupId: "group-1", groupName: "Tuesday Group" }}
      />
    );

    expect(html).toMatch(/name="group_id"[^>]*value="group-1"/);
    expect(html).toMatch(/name="kind"[^>]*value="member"/);
    expect(html).toContain("added straight onto Tuesday Group.");
    expect(html).toContain("Add member to group");
  });
});
