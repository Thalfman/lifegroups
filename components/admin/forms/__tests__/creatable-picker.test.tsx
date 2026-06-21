// @vitest-environment jsdom
import { render, screen, within, cleanup, act } from "@testing-library/react";
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

  // #776 Phase 1 (OPP-3) — the edit form preselects the group's current type.
  describe("initialValue", () => {
    const noop = vi.fn(
      async (): Promise<CreatableCreateResult> => ({
        ok: true,
      })
    );

    it("preselects an initialValue that is one of the options", () => {
      render(
        <CreatablePicker
          options={["Men", "Women"]}
          onCreate={noop}
          name="thing"
          id="thing"
          label="Thing"
          initialValue="Women"
        />
      );
      expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe(
        "Women"
      );
    });

    it("keeps a case-different initialValue selectable and selected (#785 Codex P2)", () => {
      // Stored `men` against an option `Men`: an exact-match seed keeps `men` as
      // its own option so the controlled select has a match — an unrelated save
      // can't blank the field.
      render(
        <CreatablePicker
          options={["Men", "Women"]}
          onCreate={noop}
          name="thing"
          id="thing"
          label="Thing"
          initialValue="men"
        />
      );
      const select = screen.getByRole("combobox") as HTMLSelectElement;
      expect(select.value).toBe("men");
      expect(
        within(select)
          .getAllByRole("option")
          .map((o) => o.textContent)
      ).toEqual(expect.arrayContaining(["Men", "men"]));
    });

    it("keeps an initialValue not in the options selectable and selected", () => {
      render(
        <CreatablePicker
          options={["Men", "Women"]}
          onCreate={noop}
          name="thing"
          id="thing"
          label="Thing"
          initialValue="Legacy Type"
        />
      );
      const select = screen.getByRole("combobox") as HTMLSelectElement;
      expect(select.value).toBe("Legacy Type");
      expect(
        within(select)
          .getAllByRole("option")
          .map((o) => o.textContent)
      ).toContain("Legacy Type");
    });

    it("resets back to the initialValue (not blank) on the enclosing form's reset", async () => {
      const user = userEvent.setup();
      render(
        <form>
          <CreatablePicker
            options={["Men", "Women"]}
            onCreate={noop}
            name="thing"
            id="thing"
            label="Thing"
            initialValue="Men"
          />
        </form>
      );
      const select = screen.getByRole("combobox") as HTMLSelectElement;
      // Change away from the seed, then reset: the picker returns to "Men"
      // (the edit form's current type), not to the "—" no-selection state.
      await user.selectOptions(select, "Women");
      expect(select.value).toBe("Women");
      // The native reset fires the form's "reset" event the picker listens for;
      // act() flushes the resulting React state update before we assert.
      act(() => {
        select.form?.reset();
      });
      expect(select.value).toBe("Men");
    });
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
