import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { GroupsRow, MembersRow, ProfilesRow } from "@/types/database";

// The form binds a "use server" action; stub the module so static rendering
// never pulls server-only deps (the markup never invokes the action anyway).
vi.mock("@/app/(protected)/admin/follow-ups/actions", () => ({
  adminCreateFollowUp: vi.fn(),
}));

import { FollowUpCreateForm } from "@/components/admin/follow-ups/follow-up-create-form";

function render() {
  return renderToStaticMarkup(
    <FollowUpCreateForm
      groups={[] as unknown as GroupsRow[]}
      members={[] as unknown as MembersRow[]}
      assignees={[] as unknown as ProfilesRow[]}
    />
  );
}

describe("FollowUpCreateForm (#639)", () => {
  it("no longer offers the retired Related guest field", () => {
    const html = render();
    expect(html).not.toContain("Related guest");
    expect(html).not.toContain('name="related_guest_id"');
  });

  it("defaults the type to admin, not the de-emphasised guest type", () => {
    const html = render();
    // renderToStaticMarkup marks the default-selected option.
    expect(html).toMatch(/<option value="admin"[^>]*selected=""/);
    expect(html).not.toMatch(/<option value="guest"[^>]*selected=""/);
  });

  it("disables Add follow-up until a title is entered", () => {
    const html = render();
    expect(html).toContain("Enter a title to enable Add follow-up.");
    expect(html).toMatch(
      /<button[^>]*disabled=""[^>]*>Add follow-up<\/button>/
    );
  });
});
