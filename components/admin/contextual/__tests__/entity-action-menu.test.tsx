// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EntityActionMenu } from "@/components/admin/contextual/entity-action-menu";
import type { ContextualEntity } from "@/lib/admin/contextual-actions";

const PERSON: ContextualEntity = {
  kind: "person",
  id: "p1",
  label: "Sam Carter",
};

afterEach(cleanup);

// #781 OPP-6 — the generic, registry-driven entity action menu.
describe("EntityActionMenu", () => {
  it("renders the role-gated registry actions and reports the chosen one", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <EntityActionMenu
        entity={PERSON}
        viewerRole="ministry_admin"
        triggerAriaLabel="Actions for Sam Carter"
        onSelect={onSelect}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Actions for Sam Carter" })
    );
    await user.click(await screen.findByText("Archive"));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "archive_person" })
    );
  });

  it("renders nothing for a role the registry gates out", () => {
    render(
      <EntityActionMenu
        entity={PERSON}
        viewerRole="leader"
        triggerAriaLabel="Actions for Sam Carter"
        onSelect={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: /Actions for/ })).toBeNull();
  });

  it("renders nothing when actionFilter removes every action", () => {
    render(
      <EntityActionMenu
        entity={PERSON}
        viewerRole="ministry_admin"
        triggerAriaLabel="Actions for Sam Carter"
        actionFilter={() => false}
        onSelect={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: /Actions for/ })).toBeNull();
  });

  it("renders only the actions actionFilter keeps", async () => {
    const user = userEvent.setup();
    render(
      <EntityActionMenu
        entity={PERSON}
        viewerRole="ministry_admin"
        triggerAriaLabel="Actions for Sam Carter"
        actionFilter={(a) => a.id === "archive_person"}
        onSelect={vi.fn()}
      />
    );
    await user.click(
      screen.getByRole("button", { name: "Actions for Sam Carter" })
    );
    expect(await screen.findByText("Archive")).toBeTruthy();
    expect(screen.queryByText("Change role")).toBeNull();
  });
});
