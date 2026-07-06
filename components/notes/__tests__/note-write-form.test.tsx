// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NoteWriteForm } from "@/components/notes/note-write-form";

afterEach(cleanup);

const noop = vi.fn();

function renderForm(
  overrides: Partial<Parameters<typeof NoteWriteForm>[0]> = {}
) {
  return render(
    <NoteWriteForm
      action={noop}
      label="Care note"
      idPrefix="cn-test"
      placeholder="What's going on?"
      privacyNote="Private to you."
      hiddenFields={{ subject_profile_id: "p-1" }}
      {...overrides}
    />
  );
}

describe("NoteWriteForm", () => {
  it("wires the label to the prefixed textarea and caps it at 4000 chars", () => {
    renderForm();
    const textarea = screen.getByLabelText(/Care note \(max 4000 chars\)/i);
    expect(textarea.id).toBe("cn-test-body");
    expect(textarea).toHaveProperty("maxLength", 4000);
    expect(textarea.getAttribute("name")).toBe("body");
  });

  it("renders every hidden scope field", () => {
    const { container } = renderForm({
      hiddenFields: { group_id: "g-1", extra: "x" },
    });
    const hidden = container.querySelectorAll('input[type="hidden"]');
    expect(
      Array.from(hidden).map((el) => [
        el.getAttribute("name"),
        el.getAttribute("value"),
      ])
    ).toEqual([
      ["group_id", "g-1"],
      ["extra", "x"],
    ]);
  });

  it("adds record context to the submit's accessible name only when given", () => {
    renderForm({ submitContextName: "Jordan Rivera" });
    expect(
      screen.getByRole("button", { name: "Add care note for Jordan Rivera" })
    ).toBeTruthy();

    cleanup();
    renderForm();
    const submit = screen.getByRole("button", { name: "Add care note" });
    expect(submit.getAttribute("aria-label")).toBeNull();
  });

  it("renders a Cancel control only when onCancel is supplied", () => {
    renderForm({ onCancel: vi.fn() });
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();

    cleanup();
    renderForm();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });
});
