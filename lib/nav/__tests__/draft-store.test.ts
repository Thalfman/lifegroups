// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  clearFormDraft,
  newDraftId,
  readFormDraft,
  saveFormDraft,
  snapshotForm,
} from "@/lib/nav/draft-store";

afterEach(() => {
  window.sessionStorage.clear();
});

// #781 OPP-3b — the one-case sessionStorage draft store for the "Manage group
// types" round trip.
describe("draft-store", () => {
  it("round-trips a draft through sessionStorage and clears it", () => {
    const id = newDraftId();
    saveFormDraft(id, { name: "Wednesday Westside", group_type: "Young" });
    expect(readFormDraft(id)).toEqual({
      name: "Wednesday Westside",
      group_type: "Young",
    });
    clearFormDraft(id);
    expect(readFormDraft(id)).toBeNull();
  });

  it("returns null for an unknown id", () => {
    expect(readFormDraft("missing")).toBeNull();
  });

  it("returns null (not a throw) on a corrupt entry", () => {
    window.sessionStorage.setItem("lg:draft:bad", "{not json");
    expect(readFormDraft("bad")).toBeNull();
  });

  it("mints distinct draft ids", () => {
    expect(newDraftId()).not.toBe(newDraftId());
  });

  it("snapshots a form's current field values via FormData", () => {
    const form = document.createElement("form");
    form.innerHTML = `
      <input name="name" value="Tuesday" />
      <input name="capacity" value="14" />
      <input type="hidden" name="group_id" value="g-1" />
    `;
    document.body.appendChild(form);
    expect(snapshotForm(form)).toEqual({
      name: "Tuesday",
      capacity: "14",
      group_id: "g-1",
    });
    form.remove();
  });
});
