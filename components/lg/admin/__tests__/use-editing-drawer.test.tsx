// @vitest-environment jsdom
import {
  render,
  screen,
  waitFor,
  within,
  cleanup,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEditingDrawer } from "@/components/lg/admin/use-editing-drawer";

// The hook calls router.refresh on save; stub it so the shared protocol can be
// exercised without a Next router.
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

// #665 swapped the hook's blocking `window.confirm("Discard…")` for the
// non-blocking ConfirmDialog it now renders via `discardDialog`. This harness
// drives the protocol the way every EditingSurface consumer does.
function Harness() {
  const drawer = useEditingDrawer();
  return (
    <>
      <span data-testid="open">{String(drawer.isOpen)}</span>
      <button type="button" onClick={() => drawer.open(true)}>
        open
      </button>
      <button type="button" onClick={drawer.markDirty}>
        dirty
      </button>
      <button type="button" onClick={() => drawer.reportPending(true)}>
        pending
      </button>
      <button type="button" onClick={drawer.requestClose}>
        close
      </button>
      {drawer.discardDialog}
    </>
  );
}

function isOpen() {
  return screen.getByTestId("open").textContent;
}

describe("useEditingDrawer — non-blocking discard guard (#665)", () => {
  afterEach(() => {
    cleanup();
    refresh.mockClear();
  });

  it("closes a clean form straight through with no prompt", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "open" }));
    expect(isOpen()).toBe("true");
    await user.click(screen.getByRole("button", { name: "close" }));

    expect(isOpen()).toBe("false");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("prompts a dirty form and stays open until the operator answers", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "open" }));
    await user.click(screen.getByRole("button", { name: "dirty" }));
    await user.click(screen.getByRole("button", { name: "close" }));

    // The drawer is still open behind the raised prompt.
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    expect(isOpen()).toBe("true");
  });

  it("discards (closes) only when the prompt is confirmed", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "open" }));
    await user.click(screen.getByRole("button", { name: "dirty" }));
    await user.click(screen.getByRole("button", { name: "close" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Discard" }));

    await waitFor(() => expect(isOpen()).toBe("false"));
  });

  it("keeps the drawer open when the prompt is cancelled", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "open" }));
    await user.click(screen.getByRole("button", { name: "dirty" }));
    await user.click(screen.getByRole("button", { name: "close" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(isOpen()).toBe("true");
  });

  it("ignores every dismissal route while a write is in flight (no prompt)", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "open" }));
    await user.click(screen.getByRole("button", { name: "dirty" }));
    await user.click(screen.getByRole("button", { name: "pending" }));
    await user.click(screen.getByRole("button", { name: "close" }));

    // Blocked: neither a prompt nor a close — it closes via markSaved instead.
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(isOpen()).toBe("true");
  });
});
