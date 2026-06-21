// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

// #776 Phase 0 — the shared dropdown-menu primitive wrapping Radix. These cover
// the contract later surfaces (the registry-driven EntityActionMenu) rely on:
// a trigger that toggles a portaled menu of accessible items, and item
// selection that fires the handler and dismisses the menu.
describe("DropdownMenu primitive", () => {
  afterEach(cleanup);

  function Host({ onPick }: { onPick: () => void }) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={onPick}>Edit</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  it("opens the menu from the trigger and exposes its items", async () => {
    const user = userEvent.setup();
    render(<Host onPick={vi.fn()} />);

    // Closed by default — the menu items are not mounted.
    expect(screen.queryByRole("menuitem", { name: "Edit" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Actions" }));
    expect(await screen.findByRole("menuitem", { name: "Edit" })).toBeTruthy();
  });

  it("fires the item handler and closes on select", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Host onPick={onPick} />);

    await user.click(screen.getByRole("button", { name: "Actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Edit" }));

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menuitem", { name: "Edit" })).toBeNull();
  });
});
