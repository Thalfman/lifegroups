// @vitest-environment jsdom
import { useState } from "react";
import {
  render,
  screen,
  within,
  waitFor,
  cleanup,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

// #665 added a controlled mode so discard-on-close flows can raise the dialog
// programmatically (Escape / overlay / × / Cancel on a drawer), not just from a
// dedicated trigger button. These tests cover that mode; the trigger mode is
// exercised through ConfirmActionButton in confirm-action-button.test.tsx.
describe("ConfirmDialog — controlled (programmatic) mode", () => {
  afterEach(cleanup);

  // A tiny host that drives the dialog's open state itself, the way a drawer's
  // requestClose handler does after finding a dirty form.
  function Host({ onConfirm }: { onConfirm: () => void }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          raise
        </button>
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title="Discard changes?"
          message="Discard your unsaved changes?"
          confirmLabel="Discard"
          onConfirm={onConfirm}
        />
      </>
    );
  }

  it("shows nothing until the host opens it, then renders the message", async () => {
    const user = userEvent.setup();
    render(<Host onConfirm={vi.fn()} />);

    expect(screen.queryByRole("alertdialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "raise" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("Discard your unsaved changes?");
  });

  it("runs onConfirm and closes when the confirm button is pressed", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Host onConfirm={onConfirm} />);

    await user.click(screen.getByRole("button", { name: "raise" }));
    await screen.findByRole("alertdialog");
    await user.click(screen.getByRole("button", { name: "Discard" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("Cancel closes without running onConfirm", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Host onConfirm={onConfirm} />);

    await user.click(screen.getByRole("button", { name: "raise" }));
    await screen.findByRole("alertdialog");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("Escape closes without running onConfirm", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Host onConfirm={onConfirm} />);

    await user.click(screen.getByRole("button", { name: "raise" }));
    await screen.findByRole("alertdialog");
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  // #669 review: controlled mode has no trigger ref, so the dialog must restore
  // focus to the opener itself (Cancel / Escape) or keyboard flow breaks.
  it("restores focus to the opener after Cancel", async () => {
    const user = userEvent.setup();
    render(<Host onConfirm={vi.fn()} />);

    const opener = screen.getByRole("button", { name: "raise" });
    await user.click(opener);
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(document.activeElement).toBe(opener);
  });

  it("restores focus to the opener after Escape", async () => {
    const user = userEvent.setup();
    render(<Host onConfirm={vi.fn()} />);

    const opener = screen.getByRole("button", { name: "raise" });
    await user.click(opener);
    await screen.findByRole("alertdialog");
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(document.activeElement).toBe(opener);
  });
});
