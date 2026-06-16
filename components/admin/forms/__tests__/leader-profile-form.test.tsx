import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(protected)/admin/people/actions", () => ({
  adminCreateLeaderProfile: vi.fn(),
  adminAddPersonToGroup: vi.fn(),
}));

import { LeaderProfileForm } from "@/components/admin/forms/leader-profile-form";

describe("LeaderProfileForm", () => {
  it("disables Add leader until full name and a valid email are entered", () => {
    const html = renderToStaticMarkup(<LeaderProfileForm />);

    expect(html).toContain(
      "Enter a full name and valid email to enable Add leader."
    );
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Add leader<\/button>/);
  });

  it("does not offer an in-group role when creating a directory record", () => {
    const html = renderToStaticMarkup(<LeaderProfileForm />);
    expect(html).not.toContain('name="role"');
  });

  it("in group mode carries group_id + kind, a role select, and renames the action (#643)", () => {
    const html = renderToStaticMarkup(
      <LeaderProfileForm
        assignToGroup={{ groupId: "group-1", groupName: "Tuesday Group" }}
      />
    );

    expect(html).toMatch(/name="group_id"[^>]*value="group-1"/);
    expect(html).toMatch(/name="kind"[^>]*value="leader"/);
    expect(html).toContain('name="role"');
    expect(html).toContain("Role in this group");
    expect(html).toContain("Add leader to group");
  });
});
