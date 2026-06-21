// @vitest-environment jsdom
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CreatablePicker,
  type CreatableCreateResult,
} from "@/components/admin/forms/creatable-picker";

// #776 Phase 0 — the generalized creatable picker. These cover the control's
// contract independent of any one action: it lists options + an add affordance,
// reveals a labelled box, runs the injected onCreate with the trimmed value,
// then selects it — and surfaces an onCreate failure inline.
function renderPicker(
  onCreate: (value: string) => Promise<CreatableCreateResult>
) {
  return render(
    <CreatablePicker
      options={["Men", "Women"]}
      onCreate={onCreate}
      name="thing"
      id="thing"
      label="Thing"
      addOptionLabel="＋ Add new thing…"
      newItemLabel="New thing"
    />
  );
}

async function chooseAddNew(user: ReturnType<typeof userEvent.setup>) {
  const select = screen.getByRole("combobox");
  await user.selectOptions(
    select,
    within(select)
      .getAllByRole("option")
      .find((o) =>
        o.textContent?.includes("Add new thing")
      ) as HTMLOptionElement
  );
  return select;
}

describe("CreatablePicker", () => {
  afterEach(cleanup);

  it("lists options, a no-selection, and an add-new option; box hidden until chosen", () => {
    renderPicker(
      vi.fn(async (): Promise<CreatableCreateResult> => ({ ok: true }))
    );
    const labels = within(screen.getByRole("combobox"))
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(labels).toEqual(["—", "Men", "Women", "＋ Add new thing…"]);
    expect(screen.queryByLabelText("New thing")).toBeNull();
  });

  it("runs onCreate with the trimmed value and selects it", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn(
      async (): Promise<CreatableCreateResult> => ({
        ok: true,
      })
    );
    const select = (await renderAndAdd(user, onCreate)) as HTMLSelectElement;

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith("Young Families");
    expect(screen.queryByLabelText("New thing")).toBeNull();
    expect(select.value).toBe("Young Families");
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent)
    ).toContain("Young Families");
  });

  it("surfaces an onCreate failure inline and keeps the box open", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn(
      async (): Promise<CreatableCreateResult> => ({
        ok: false,
        error: "Nope.",
      })
    );
    await renderAndAdd(user, onCreate);

    expect(screen.getByRole("alert").textContent).toBe("Nope.");
    expect(screen.getByLabelText("New thing")).toBeTruthy();
  });

  // Shared open → type → Add flow.
  async function renderAndAdd(
    user: ReturnType<typeof userEvent.setup>,
    onCreate: (value: string) => Promise<CreatableCreateResult>
  ) {
    renderPicker(onCreate);
    const select = await chooseAddNew(user);
    await user.type(screen.getByLabelText("New thing"), "Young Families");
    await user.click(screen.getByRole("button", { name: "Add" }));
    return select;
  }
});
