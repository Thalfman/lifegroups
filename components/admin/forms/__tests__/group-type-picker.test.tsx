// @vitest-environment jsdom
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { actionOk } from "@/lib/shared/action-result";

// The picker binds the "use server" adminAddGroupType action; stub the module so
// the client render never pulls server-only deps. The mock echoes success.
const adminAddGroupType = vi.fn(async (_prev: unknown, _input: unknown) =>
  actionOk({ id: "row-1" })
);
vi.mock("@/app/(protected)/admin/plan/actions", () => ({
  adminAddGroupType: (prev: unknown, input: unknown) =>
    adminAddGroupType(prev, input),
}));

// The "Manage group types" affordance (#781 OPP-3b) routes via the App Router;
// stub it so the client render has a router in these jsdom tests.
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import { GroupTypePicker } from "@/components/admin/forms/group-type-picker";
import { readFormDraft } from "@/lib/nav/draft-store";

describe("GroupTypePicker (#747)", () => {
  afterEach(() => {
    cleanup();
    adminAddGroupType.mockClear();
    push.mockClear();
  });

  it("renders the existing types plus a no-selection and an add-new option", () => {
    render(<GroupTypePicker groupTypes={["Men", "Women"]} />);
    const select = screen.getByRole("combobox");
    const options = within(select).getAllByRole("option");
    const labels = options.map((o) => o.textContent);
    expect(labels).toContain("Men");
    expect(labels).toContain("Women");
    expect(labels).toContain("—");
    expect(labels.some((l) => l?.includes("Add new type"))).toBe(true);
    // The add box is hidden until chosen.
    expect(screen.queryByLabelText("New group type")).toBeNull();
  });

  it("reveals the labelled text box when 'Add new type…' is chosen", async () => {
    const user = userEvent.setup();
    render(<GroupTypePicker groupTypes={["Men"]} />);
    const select = screen.getByRole("combobox");

    await user.selectOptions(
      select,
      within(select)
        .getAllByRole("option")
        .find((o) =>
          o.textContent?.includes("Add new type")
        ) as HTMLOptionElement
    );

    expect(screen.getByLabelText("New group type")).toBeTruthy();
  });

  it("hides 'Manage group types' unless enabled, and shows it when enabled", () => {
    const { rerender } = render(<GroupTypePicker groupTypes={["Men"]} />);
    expect(
      screen.queryByRole("button", { name: "Manage group types" })
    ).toBeNull();
    rerender(<GroupTypePicker groupTypes={["Men"]} enableManageTypes />);
    expect(
      screen.getByRole("button", { name: "Manage group types" })
    ).toBeTruthy();
  });

  it("hands off to the Settings editor with a draft id + return marker (#781 OPP-3b)", async () => {
    const user = userEvent.setup();
    render(
      <form>
        <input name="name" defaultValue="Wednesday Westside" />
        <GroupTypePicker
          groupTypes={["Men"]}
          name="group_type"
          id="g"
          enableManageTypes
        />
      </form>
    );

    await user.click(
      screen.getByRole("button", { name: "Manage group types" })
    );
    expect(push).toHaveBeenCalledTimes(1);
    const url = push.mock.calls[0][0] as string;
    expect(url).toContain("/admin/settings?tab=groups");
    expect(url).toContain("draft=");
    expect(url).toContain("from=groups");

    // The half-filled form was snapshotted to sessionStorage under that draft id
    // — the restore half reads it back on return to the Groups list.
    const draftId = new URL(url, "https://x").searchParams.get("draft");
    expect(draftId).toBeTruthy();
    expect(readFormDraft(draftId as string)).toMatchObject({
      name: "Wednesday Westside",
    });
    window.sessionStorage.clear();
  });

  it("carries the setup origin through the hand-off when fromSetup (#788)", async () => {
    const user = userEvent.setup();
    render(
      <form>
        <input name="name" defaultValue="Wednesday" />
        <GroupTypePicker
          groupTypes={["Men"]}
          name="group_type"
          id="g"
          enableManageTypes
          fromSetup
        />
      </form>
    );
    await user.click(
      screen.getByRole("button", { name: "Manage group types" })
    );
    expect(push.mock.calls[0][0]).toContain("origin_setup=1");
    window.sessionStorage.clear();
  });

  it("disables the hand-off while a write is in flight, blocking the navigation (#788)", async () => {
    const user = userEvent.setup();
    render(
      <form>
        <input name="name" defaultValue="Wednesday" />
        <GroupTypePicker
          groupTypes={["Men"]}
          name="group_type"
          id="g"
          enableManageTypes
          manageDisabled
        />
      </form>
    );
    const button = screen.getByRole("button", {
      name: "Manage group types",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await user.click(button);
    expect(push).not.toHaveBeenCalled();
  });

  it("adds a new type via the audited action and selects it", async () => {
    const user = userEvent.setup();
    render(<GroupTypePicker groupTypes={["Men"]} />);
    const select = screen.getByRole("combobox");

    await user.selectOptions(
      select,
      within(select)
        .getAllByRole("option")
        .find((o) =>
          o.textContent?.includes("Add new type")
        ) as HTMLOptionElement
    );

    await user.type(screen.getByLabelText("New group type"), "Young Families");
    await user.click(screen.getByRole("button", { name: "Add" }));

    // The action was called with the trimmed name (FormData carries group_type).
    expect(adminAddGroupType).toHaveBeenCalledTimes(1);
    const [, formData] = adminAddGroupType.mock.calls[0];
    expect((formData as FormData).get("group_type")).toBe("Young Families");

    // The add box closes and the new type is now the selected, posted value.
    expect(screen.queryByLabelText("New group type")).toBeNull();
    expect((select as HTMLSelectElement).value).toBe("Young Families");
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent)
    ).toContain("Young Families");
  });
});
