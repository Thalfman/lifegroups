// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The form posts through audited server actions; stub them so the test renders
// without pulling the "use server" chain.
vi.mock("@/app/(protected)/admin/shepherd-care/care-notes-actions", () => ({
  adminWriteCareNote: vi.fn(),
  adminWritePrayerRequest: vi.fn(),
}));

import { CareNoteWriteForm } from "@/components/admin/shepherd-care/care-note-write-form";

afterEach(cleanup);

// #785 — the accordion's inline note form and a contextual-drawer instance can
// be mounted for the SAME leader at once, so the drawer namespaces its field ids
// to avoid a duplicate-id / wrong-label collision.
describe("CareNoteWriteForm id namespacing", () => {
  const PROFILE = "00000000-0000-4000-8000-000000000001";

  it("keeps stable ids with no namespace (inline usage)", () => {
    render(<CareNoteWriteForm subjectProfileId={PROFILE} kind="care_note" />);
    expect(screen.getByLabelText(/Care note/i).id).toBe(`cn-${PROFILE}-body`);
  });

  it("namespaces the textarea id when idNamespace is given (drawer usage)", () => {
    render(
      <CareNoteWriteForm
        subjectProfileId={PROFILE}
        kind="care_note"
        idNamespace="ctx"
      />
    );
    expect(screen.getByLabelText(/Care note/i).id).toBe(
      `cn-${PROFILE}-ctx-body`
    );
  });
});
