// @vitest-environment jsdom
import {
  render,
  screen,
  within,
  waitFor,
  cleanup,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { actionOk } from "@/lib/shared/action-result";
import type { TestAccountsResponse } from "@/app/(protected)/admin/super-admin/test-accounts-actions";

// The panel binds "use server" actions; stub the module so the client render
// never pulls server-only deps.
const testAccountsEnable = vi.fn();
const testAccountsDisable = vi.fn();
vi.mock("@/app/(protected)/admin/super-admin/test-accounts-actions", () => ({
  testAccountsStatus: vi.fn(),
  testAccountsEnable: () => testAccountsEnable(),
  testAccountsDisable: () => testAccountsDisable(),
  testAccountsDiagnose: vi.fn(),
}));

import { TestAccountsPanel } from "@/components/admin/test-accounts-panel";

function statusFixture(
  overrides: Partial<TestAccountsResponse> = {}
): TestAccountsResponse {
  return {
    ok: true,
    enabledOverall: false,
    isRemoteSupabase: false,
    summary: [],
    groups: { a: "missing", b: "missing" },
    warnings: [],
    errors: [],
    ...overrides,
  } as TestAccountsResponse;
}

// #666 swapped the impacting actions' blocking `window.confirm` for the
// non-blocking dialog: the click opens the dialog and the action fires from its
// confirm button. The reads (Refresh/Diagnose) stay gate-free.
describe("TestAccountsPanel — non-blocking confirm (#666)", () => {
  afterEach(() => {
    cleanup();
    testAccountsEnable.mockReset();
    testAccountsDisable.mockReset();
  });

  it("Enable opens the dialog and only runs after confirm", async () => {
    const user = userEvent.setup();
    testAccountsEnable.mockResolvedValue(actionOk(statusFixture()));
    render(
      <TestAccountsPanel initialStatus={statusFixture()} initialErrors={[]} />
    );

    await user.click(
      screen.getByRole("button", { name: "Enable test accounts" })
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain(
      "Enable test login accounts? Their passwords are known to anyone with the env file."
    );
    expect(testAccountsEnable).not.toHaveBeenCalled();

    await user.click(
      within(dialog).getByRole("button", { name: "Enable test accounts" })
    );
    await waitFor(() => expect(testAccountsEnable).toHaveBeenCalledTimes(1));
  });

  it("Enable shouts louder when the target is a REMOTE database", async () => {
    const user = userEvent.setup();
    render(
      <TestAccountsPanel
        initialStatus={statusFixture({ isRemoteSupabase: true })}
        initialErrors={[]}
      />
    );

    await user.click(
      screen.getByRole("button", { name: "Enable test accounts" })
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain(
      "You are about to enable test login accounts on a REMOTE database. These accounts have known passwords. Proceed?"
    );
  });

  it("Disable opens the dialog and only runs after confirm", async () => {
    const user = userEvent.setup();
    testAccountsDisable.mockResolvedValue(actionOk(statusFixture()));
    render(
      <TestAccountsPanel initialStatus={statusFixture()} initialErrors={[]} />
    );

    await user.click(
      screen.getByRole("button", { name: "Disable test accounts" })
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain(
      "Disable all known test accounts? Their logins will stop working immediately."
    );

    await user.click(
      within(dialog).getByRole("button", { name: "Disable test accounts" })
    );
    await waitFor(() => expect(testAccountsDisable).toHaveBeenCalledTimes(1));
  });

  it("cancelling never runs the action", async () => {
    const user = userEvent.setup();
    render(
      <TestAccountsPanel initialStatus={statusFixture()} initialErrors={[]} />
    );

    await user.click(
      screen.getByRole("button", { name: "Enable test accounts" })
    );
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(testAccountsEnable).not.toHaveBeenCalled();
  });
});
