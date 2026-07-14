// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

import { SuperAdminConsole } from "@/components/admin/super-admin-console";

afterEach(() => {
  cleanup();
  replace.mockReset();
  window.history.replaceState({}, "", "/admin/super-admin");
});

const WORKSPACES = [
  { id: "readiness", label: "Readiness", node: <p>Readiness body</p> },
  { id: "access", label: "Access", node: <p>Access body</p> },
  { id: "danger", label: "Danger Zone", danger: true, node: null },
];

describe("SuperAdminConsole server-visible workspace navigation", () => {
  it("renders only the server-selected panel and links every tab to a query", () => {
    render(
      <SuperAdminConsole
        statusRow={null}
        workspaces={WORKSPACES}
        activeWorkspaceId="access"
      />
    );

    expect(screen.getByText("Access body")).toBeTruthy();
    expect(screen.queryByText("Readiness body")).toBeNull();
    expect(
      screen.getByRole("tab", { name: "Access" }).getAttribute("href")
    ).toBe("/admin/super-admin?workspace=access");
    expect(
      screen.getByRole("tab", { name: "Danger Zone" }).getAttribute("href")
    ).toBe("/admin/super-admin?workspace=danger");
  });

  it("turns a legacy hash into the matching server-visible workspace", async () => {
    window.history.replaceState({}, "", "/admin/super-admin#people-import");
    render(
      <SuperAdminConsole
        statusRow={null}
        workspaces={WORKSPACES}
        activeWorkspaceId="readiness"
        hashAliases={{ "people-import": "access" }}
      />
    );

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        "/admin/super-admin?workspace=access#people-import",
        { scroll: false }
      )
    );
  });
});
