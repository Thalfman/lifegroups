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
import { actionOk, actionFail } from "@/lib/shared/action-result";

// The picker binds a "use server" action; stub the module so the client render
// never pulls server-only deps.
const adminAddGroupType = vi.fn(async (_prev: unknown, _input: FormData) =>
  actionOk({ id: "row1" })
);
vi.mock("@/app/(protected)/admin/settings/actions", () => ({
  adminAddGroupType: (prev: unknown, input: FormData) =>
    adminAddGroupType(prev, input),
}));

import { GroupTypePicker } from "@/components/admin/forms/group-type-picker";

const TYPES = ["Men's", "Women's"];

function renderPicker(extra?: { defaultValue?: string }) {
  return render(
    <GroupTypePicker
      id="prospect-desired_group_type"
      name="desired_group_type"
      label="Desired group type (optional)"
      groupTypes={TYPES}
      defaultValue={extra?.defaultValue}
    />
  );
}

describe("GroupTypePicker (#747)", () => {
  afterEach(() => {
    cleanup();
    adminAddGroupType.mockClear();
  });

  it("renders the existing types plus the no-selection and add-new options", () => {
    renderPicker();
    const select = screen.getByLabelText(
      "Desired group type (optional)"
    ) as HTMLSelectElement;
    const options = within(select)
      .queryAllByRole("option")
      .map((o) => o.textContent);
    expect(options).toEqual(["—", "Men's", "Women's", "＋ Add new type…"]);
  });

  it("submits the empty value (not set) by default via the hidden input", () => {
    const { container } = renderPicker();
    const hidden = container.querySelector(
      'input[type="hidden"][name="desired_group_type"]'
    ) as HTMLInputElement;
    expect(hidden).not.toBeNull();
    expect(hidden.value).toBe("");
  });

  it("pre-selects a provided defaultValue, even when off the master list", () => {
    const { container } = renderPicker({
      defaultValue: "Mixed – Empty Nesters",
    });
    const hidden = container.querySelector(
      'input[type="hidden"][name="desired_group_type"]'
    ) as HTMLInputElement;
    expect(hidden.value).toBe("Mixed – Empty Nesters");
    // The off-list value is offered as an option so it renders as selected.
    expect(
      screen.getByRole("option", { name: "Mixed – Empty Nesters" })
    ).toBeDefined();
  });

  it("choosing Add new type… reveals a labelled text box", async () => {
    const user = userEvent.setup();
    renderPicker();
    expect(screen.queryByLabelText("New group type")).toBeNull();

    await user.selectOptions(
      screen.getByLabelText("Desired group type (optional)"),
      "__lg_add_new_type__"
    );
    expect(screen.getByLabelText("New group type")).toBeDefined();
  });

  it("adds a new type: calls the RPC, then selects it for submission", async () => {
    const user = userEvent.setup();
    const { container } = renderPicker();

    await user.selectOptions(
      screen.getByLabelText("Desired group type (optional)"),
      "__lg_add_new_type__"
    );
    await user.type(
      screen.getByLabelText("New group type"),
      "Mixed – Young Families"
    );
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(adminAddGroupType).toHaveBeenCalledTimes(1));
    const fd = adminAddGroupType.mock.calls[0][1] as FormData;
    expect(fd.get("group_type")).toBe("Mixed – Young Families");

    // The new type is selected and submitted via the hidden input.
    const hidden = container.querySelector(
      'input[type="hidden"][name="desired_group_type"]'
    ) as HTMLInputElement;
    await waitFor(() => expect(hidden.value).toBe("Mixed – Young Families"));
    // The add box is dismissed once the type is added.
    expect(screen.queryByLabelText("New group type")).toBeNull();
  });

  it("rejects a blank new type without calling the RPC", async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.selectOptions(
      screen.getByLabelText("Desired group type (optional)"),
      "__lg_add_new_type__"
    );
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(adminAddGroupType).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain(
      "Enter a group type."
    );
  });

  it("surfaces an RPC failure inline", async () => {
    adminAddGroupType.mockResolvedValueOnce(actionFail(["nope, try again"]));
    const user = userEvent.setup();
    renderPicker();

    await user.selectOptions(
      screen.getByLabelText("Desired group type (optional)"),
      "__lg_add_new_type__"
    );
    await user.type(screen.getByLabelText("New group type"), "Brand New");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("nope, try again")
    );
  });
});
