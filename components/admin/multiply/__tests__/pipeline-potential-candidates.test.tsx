// @vitest-environment jsdom
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { actionOk, actionFail } from "@/lib/shared/action-result";
import type { PipelinePotentialCandidate } from "@/lib/admin/multiplication";

// The lock-in form posts through the audited create action; stub the "use
// server" module so the client render never pulls server-only deps.
const adminCreateMultiplicationCandidate = vi.fn(
  async (_prev: unknown, _formData: FormData) => actionOk({ id: "cand-1" })
);
vi.mock("@/app/(protected)/admin/launch-planning/actions", () => ({
  adminCreateMultiplicationCandidate: (prev: unknown, formData: FormData) =>
    adminCreateMultiplicationCandidate(prev, formData),
}));

import { PipelinePotentialCandidates } from "@/components/admin/multiply/pipeline-potential-candidates";

const POTENTIAL: PipelinePotentialCandidate[] = [
  { groupId: "g1", groupName: "Tuesday Young Families", groupType: "Young" },
];

describe("PipelinePotentialCandidates — lock-in flow (#757)", () => {
  afterEach(() => {
    cleanup();
    adminCreateMultiplicationCandidate.mockClear();
  });

  it("opens the five-box readiness checklist when a potential is selected", async () => {
    const user = userEvent.setup();
    render(<PipelinePotentialCandidates candidates={POTENTIAL} />);

    // Read-only until selected: no checklist yet.
    expect(screen.queryByText("12+ members")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Lock in" }));

    for (const label of [
      "12+ members",
      "3+ years",
      "Co-Shepherd 1+ yr",
      "Shepherd willing",
      "Need for similar group",
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("saves through the create action and threads group id + the ticked flags", async () => {
    const user = userEvent.setup();
    render(<PipelinePotentialCandidates candidates={POTENTIAL} />);

    await user.click(screen.getByRole("button", { name: "Lock in" }));
    // Tick two of the five boxes.
    await user.click(screen.getByLabelText("12+ members"));
    await user.click(screen.getByLabelText("Shepherd willing"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(adminCreateMultiplicationCandidate).toHaveBeenCalledTimes(1)
    );
    const formData = adminCreateMultiplicationCandidate.mock
      .calls[0][1] as FormData;
    expect(formData.get("group_id")).toBe("g1");
    expect(formData.get("status")).toBe("watching");
    expect(formData.get("enough_members")).toBe("on");
    expect(formData.get("shepherd_willing")).toBe("on");
    // Unticked boxes are absent (the action's input.has read maps them to false).
    expect(formData.get("established_long_enough")).toBeNull();
    expect(formData.get("co_shepherd_tenured")).toBeNull();
    expect(formData.get("needs_similar_stage")).toBeNull();
  });

  it("locks in with zero boxes ticked (lock-in is never gated)", async () => {
    const user = userEvent.setup();
    render(<PipelinePotentialCandidates candidates={POTENTIAL} />);

    await user.click(screen.getByRole("button", { name: "Lock in" }));
    // Save immediately with nothing ticked.
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(adminCreateMultiplicationCandidate).toHaveBeenCalledTimes(1)
    );
    const formData = adminCreateMultiplicationCandidate.mock
      .calls[0][1] as FormData;
    expect(formData.get("group_id")).toBe("g1");
    for (const name of [
      "enough_members",
      "established_long_enough",
      "co_shepherd_tenured",
      "shepherd_willing",
      "needs_similar_stage",
    ]) {
      expect(formData.get(name)).toBeNull();
    }
  });

  it("surfaces an action error and keeps the form open", async () => {
    adminCreateMultiplicationCandidate.mockResolvedValueOnce(
      actionFail(["The candidate was not saved. Please try again."])
    );
    const user = userEvent.setup();
    render(<PipelinePotentialCandidates candidates={POTENTIAL} />);

    await user.click(screen.getByRole("button", { name: "Lock in" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "The candidate was not saved. Please try again."
    );
    // Form is still open (Save still present).
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  });
});
