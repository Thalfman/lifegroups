// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The form posts through audited server actions; stub them so the test renders
// without pulling the "use server" chain.
vi.mock("@/app/(protected)/leader/[groupId]/care/actions", () => ({
  leaderWriteGroupCareNote: vi.fn(),
  leaderWriteGroupPrayerRequest: vi.fn(),
}));

import { GroupNoteWriteForm } from "@/components/leader/group-note-write-form";

afterEach(cleanup);

// The Shepherd tier's config of the shared NoteWriteForm (ADR 0036): pins the
// group-scoped hidden field, the tier's id scheme, and the per-kind copy.
describe("GroupNoteWriteForm", () => {
  const GROUP = "00000000-0000-4000-8000-000000000001";

  it("scopes the write to the group via a hidden field", () => {
    const { container } = render(
      <GroupNoteWriteForm groupId={GROUP} kind="care_note" />
    );
    const hidden = container.querySelector('input[type="hidden"]');
    expect(hidden?.getAttribute("name")).toBe("group_id");
    expect(hidden?.getAttribute("value")).toBe(GROUP);
  });

  it("keeps the gcn/gpr id scheme per kind", () => {
    render(<GroupNoteWriteForm groupId={GROUP} kind="care_note" />);
    expect(screen.getByLabelText(/Care note/i).id).toBe("gcn-body");

    cleanup();
    render(<GroupNoteWriteForm groupId={GROUP} kind="prayer_request" />);
    expect(screen.getByLabelText(/Prayer request/i).id).toBe("gpr-body");
  });

  it("uses the group-facing copy, not the admin subject copy", () => {
    render(<GroupNoteWriteForm groupId={GROUP} kind="prayer_request" />);
    expect(
      screen.getByPlaceholderText("How can we be praying for your group?")
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Add prayer request" })
    ).toBeTruthy();
  });
});
