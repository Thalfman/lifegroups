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

import { GroupTypePicker } from "@/components/admin/forms/group-type-picker";

describe("GroupTypePicker (#747)", () => {
  afterEach(() => {
    cleanup();
    adminAddGroupType.mockClear();
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
