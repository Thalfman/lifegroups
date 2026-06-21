// @vitest-environment jsdom
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

// The shared drawer calls router.refresh on save; stub it so the host can be
// exercised without a mounted Next app router.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import {
  ContextualActionProvider,
  useContextualAction,
  type ContextualActionBodies,
} from "@/components/lg/admin/contextual-action-provider";
import { CONTEXTUAL_ACTION_REGISTRY } from "@/lib/admin/contextual-actions";

// #776 Phase 0 — the shared contextual-action host. These prove the load-bearing
// contract later phases lean on: openAction mounts the registered body in the
// one shared drawer, close clears it, and the body's dirty signal delegates to
// the drawer's discard guard (it does not own drawer state itself).
const editGroup = CONTEXTUAL_ACTION_REGISTRY.group[0];

const bodies: ContextualActionBodies = {
  group_editor: ({ entity, controls }) => (
    <div>
      <p>Editing {entity.label}</p>
      <button type="button" onClick={() => controls.markDirty()}>
        type
      </button>
    </div>
  ),
};

function Opener() {
  const { openAction } = useContextualAction();
  return (
    <button
      type="button"
      onClick={() =>
        openAction({
          entity: { kind: "group", id: "g1", label: "Downtown" },
          action: editGroup,
        })
      }
    >
      open editor
    </button>
  );
}

function Host() {
  return (
    <ContextualActionProvider bodies={bodies}>
      <Opener />
    </ContextualActionProvider>
  );
}

describe("ContextualActionProvider", () => {
  afterEach(cleanup);

  it("opens the registered body in the shared drawer", async () => {
    const user = userEvent.setup();
    render(<Host />);

    // Closed by default — no drawer, no body.
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(screen.getByRole("button", { name: "open editor" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Edit" })).toBeTruthy();
    expect(within(dialog).getByText("Editing Downtown")).toBeTruthy();
  });

  it("clears the body when the drawer closes (clean form)", async () => {
    const user = userEvent.setup();
    render(<Host />);

    await user.click(screen.getByRole("button", { name: "open editor" }));
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: "Close Edit" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Editing Downtown")).toBeNull();
  });

  it("delegates a dirty body's close to the shared discard guard", async () => {
    const user = userEvent.setup();
    render(<Host />);

    await user.click(screen.getByRole("button", { name: "open editor" }));
    await screen.findByRole("dialog");

    // Dirty the body, then attempt to close: the host must raise the discard
    // confirm instead of dropping the form, and keep the body mounted.
    await user.click(screen.getByRole("button", { name: "type" }));
    await user.click(screen.getByRole("button", { name: "Close Edit" }));

    expect(
      await screen.findByText("Discard your unsaved changes?")
    ).toBeTruthy();
    expect(screen.getByText("Editing Downtown")).toBeTruthy();

    // Confirming discard tears the drawer down.
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.queryByText("Editing Downtown")).toBeNull();
  });

  it("throws if useContextualAction is used outside the provider", () => {
    function Orphan() {
      useContextualAction();
      return null;
    }
    expect(() => render(<Orphan />)).toThrow(/ContextualActionProvider/);
  });
});
