import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(protected)/admin/people/actions", () => ({
  adminCreateLeaderProfile: vi.fn(),
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
});
