import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The form binds a "use server" action; stub the module so static rendering
// never pulls server-only deps (the markup never invokes the action anyway).
vi.mock("@/app/(protected)/admin/people/actions", () => ({
  adminCreateMember: vi.fn(),
}));

import { MemberForm } from "@/components/admin/forms/member-form";

describe("MemberForm", () => {
  it("disables Add member until a full name is entered", () => {
    const html = renderToStaticMarkup(<MemberForm />);

    expect(html).toContain("Enter a full name to enable Add member.");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Add member<\/button>/);
  });
});
