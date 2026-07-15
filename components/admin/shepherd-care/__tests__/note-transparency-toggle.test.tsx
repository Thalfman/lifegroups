// @vitest-environment jsdom
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The toggle posts through the audited grant action; stub it so the test
// renders without pulling the "use server" chain.
vi.mock("@/app/(protected)/admin/shepherd-care/care-notes-actions", () => ({
  setNoteTransparencyGrant: vi.fn(),
}));

// Pin the action-form hook to a successful submit so the status line renders;
// keep the real FormStatus so the test exercises the actual text derivation.
vi.mock("@/components/admin/forms/action-form", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/components/admin/forms/action-form")
    >();
  return {
    ...actual,
    useActionForm: () => ({
      state: { ok: true as const, value: { id: "grant-1" } },
      formAction: vi.fn(),
      pending: false,
      formRef: { current: null },
    }),
  };
});

import { NoteTransparencyToggle } from "@/components/admin/shepherd-care/note-transparency-toggle";

afterEach(cleanup);

const PROFILE = "00000000-0000-4000-8000-000000000002";

// The success message must describe the direction the admin SUBMITTED, not
// whatever direction the next submit would take. The grant action revalidates
// the page, so after a successful "turn on" this component re-renders with
// granted=true — deriving the text from the un-latched `next` would flip a
// successful "Leadership can now read." into "Sealed." the moment the fresh
// payload lands (the race that flaked the leader-care-note-write E2E spec).
describe("NoteTransparencyToggle success text", () => {
  it("keeps the turn-on confirmation after revalidation flips granted to true", () => {
    const { container, rerender } = render(
      <NoteTransparencyToggle subjectProfileId={PROFILE} granted={false} />
    );
    // Submit while the grant is OFF (direction: turn ON)...
    fireEvent.submit(container.querySelector("form")!);
    // ...then the revalidated payload re-renders with the NEW granted state.
    rerender(
      <NoteTransparencyToggle subjectProfileId={PROFILE} granted={true} />
    );

    expect(screen.getByText("Leadership can now read.")).toBeDefined();
    expect(screen.queryByText("Sealed.")).toBeNull();
    expect(screen.getByText("Leadership visibility: On")).toBeDefined();
  });

  it("keeps the seal confirmation after revalidation flips granted to false", () => {
    const { container, rerender } = render(
      <NoteTransparencyToggle subjectProfileId={PROFILE} granted={true} />
    );
    fireEvent.submit(container.querySelector("form")!);
    rerender(
      <NoteTransparencyToggle subjectProfileId={PROFILE} granted={false} />
    );

    expect(screen.getByText("Sealed.")).toBeDefined();
    expect(screen.queryByText("Leadership can now read.")).toBeNull();
    expect(screen.getByText("Leadership visibility: Sealed")).toBeDefined();
  });
});
