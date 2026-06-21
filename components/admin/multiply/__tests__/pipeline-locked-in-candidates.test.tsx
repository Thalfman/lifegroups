// @vitest-environment jsdom
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { actionOk, actionFail } from "@/lib/shared/action-result";
import {
  evaluateReadiness,
  type CandidateView,
} from "@/lib/admin/multiplication";

// Remove maps to the audited soft-archive action; the inline readiness toggle
// (OPP-5 #781) maps to the audited update action. Stub both "use server" exports.
const adminArchiveMultiplicationCandidate = vi.fn(
  async (_prev: unknown, _formData: FormData) => actionOk({ id: "cand-1" })
);
const adminUpdateMultiplicationCandidate = vi.fn(
  async (_prev: unknown, _formData: FormData) => actionOk({ id: "cand-1" })
);
vi.mock("@/app/(protected)/admin/launch-planning/actions", () => ({
  adminArchiveMultiplicationCandidate: (prev: unknown, formData: FormData) =>
    adminArchiveMultiplicationCandidate(prev, formData),
  adminUpdateMultiplicationCandidate: (prev: unknown, formData: FormData) =>
    adminUpdateMultiplicationCandidate(prev, formData),
}));

import { PipelineLockedInCandidates } from "@/components/admin/multiply/pipeline-locked-in-candidates";

const CANDIDATE: CandidateView = {
  candidateId: "cand-1",
  groupId: "g1",
  groupName: "Tuesday Young Families",
  groupType: "Young",
  segment: "Young",
  targetYear: 2027,
  status: "planned",
  enoughMembers: true,
  establishedLongEnough: false,
  coShepherdTenured: false,
  shepherdWilling: true,
  needsSimilarStage: false,
  notes: null,
  successorDesignate: null,
  meetingTime: null,
  activeMemberCount: 14,
  manualMemberCount: null,
  memberCount: 14,
  readiness: evaluateReadiness({
    enoughMembers: true,
    establishedLongEnough: false,
    coShepherdTenured: false,
    shepherdWilling: true,
    needsSimilarStage: false,
  }),
  leaderPipelineId: null,
  linkedApprentice: null,
};

describe("PipelineLockedInCandidates — remove flow (#757)", () => {
  afterEach(() => {
    cleanup();
    adminArchiveMultiplicationCandidate.mockClear();
    adminUpdateMultiplicationCandidate.mockClear();
  });

  it("renders status + target year for a locked-in candidate", () => {
    render(<PipelineLockedInCandidates candidates={[CANDIDATE]} />);
    expect(screen.getByText("Planned")).toBeTruthy();
    expect(screen.getByText("2027")).toBeTruthy();
  });

  it("removes through the audited archive action threading the candidate id", async () => {
    const user = userEvent.setup();
    render(<PipelineLockedInCandidates candidates={[CANDIDATE]} />);

    await user.click(
      screen.getByRole("button", {
        name: "Remove Tuesday Young Families from the plan",
      })
    );

    await waitFor(() =>
      expect(adminArchiveMultiplicationCandidate).toHaveBeenCalledTimes(1)
    );
    const formData = adminArchiveMultiplicationCandidate.mock
      .calls[0][1] as FormData;
    expect(formData.get("candidate_id")).toBe("cand-1");
  });

  it("surfaces an archive error", async () => {
    adminArchiveMultiplicationCandidate.mockResolvedValueOnce(
      actionFail(["The candidate was not archived. Please try again."])
    );
    const user = userEvent.setup();
    render(<PipelineLockedInCandidates candidates={[CANDIDATE]} />);

    await user.click(
      screen.getByRole("button", {
        name: "Remove Tuesday Young Families from the plan",
      })
    );

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "The candidate was not archived. Please try again."
    );
  });
});

describe("PipelineLockedInCandidates — inline readiness toggle (OPP-5 #781)", () => {
  afterEach(() => {
    cleanup();
    adminArchiveMultiplicationCandidate.mockClear();
    adminUpdateMultiplicationCandidate.mockClear();
  });

  it("renders the five criteria as checkboxes reflecting stored readiness", () => {
    render(<PipelineLockedInCandidates candidates={[CANDIDATE]} />);
    // enoughMembers + shepherdWilling are stored true; the rest false.
    const enough = screen.getByRole("checkbox", {
      name: "12+ members",
    }) as HTMLInputElement;
    const established = screen.getByRole("checkbox", {
      name: "3+ years",
    }) as HTMLInputElement;
    expect(enough.checked).toBe(true);
    expect(established.checked).toBe(false);
    expect(screen.getByText("2/5 ready")).toBeTruthy();
  });

  it("optimistically toggles a criterion and posts a full audited update", async () => {
    const user = userEvent.setup();
    render(<PipelineLockedInCandidates candidates={[CANDIDATE]} />);

    await user.click(screen.getByRole("checkbox", { name: "3+ years" }));

    // Optimistic: the box reads checked immediately and the count climbs.
    const established = screen.getByRole("checkbox", {
      name: "3+ years",
    }) as HTMLInputElement;
    expect(established.checked).toBe(true);
    expect(screen.getByText("3/5 ready")).toBeTruthy();

    await waitFor(() =>
      expect(adminUpdateMultiplicationCandidate).toHaveBeenCalledTimes(1)
    );
    const formData = adminUpdateMultiplicationCandidate.mock
      .calls[0][1] as FormData;
    // Full update: candidate id + anchoring group + preserved status/year, plus
    // the toggled flag now present and the untouched flags unchanged.
    expect(formData.get("candidate_id")).toBe("cand-1");
    expect(formData.get("group_id")).toBe("g1");
    expect(formData.get("status")).toBe("planned");
    expect(formData.get("target_year")).toBe("2027");
    expect(formData.get("established_long_enough")).toBe("on");
    expect(formData.get("enough_members")).toBe("on");
    expect(formData.get("shepherd_willing")).toBe("on");
    expect(formData.get("co_shepherd_tenured")).toBeNull();
    expect(formData.get("needs_similar_stage")).toBeNull();
  });

  it("rolls back the toggled criterion and surfaces an error on failure", async () => {
    adminUpdateMultiplicationCandidate.mockResolvedValueOnce(
      actionFail(["The candidate was not saved. Please try again."])
    );
    const user = userEvent.setup();
    render(<PipelineLockedInCandidates candidates={[CANDIDATE]} />);

    await user.click(screen.getByRole("checkbox", { name: "3+ years" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "The candidate was not saved. Please try again."
    );
    const established = screen.getByRole("checkbox", {
      name: "3+ years",
    }) as HTMLInputElement;
    expect(established.checked).toBe(false);
    expect(screen.getByText("2/5 ready")).toBeTruthy();
  });

  it("does not gate the toggle behind a confirm dialog", async () => {
    const user = userEvent.setup();
    render(<PipelineLockedInCandidates candidates={[CANDIDATE]} />);

    await user.click(
      screen.getByRole("checkbox", { name: "Shepherd willing" })
    );

    // The write fires straight away — no intervening confirm step.
    await waitFor(() =>
      expect(adminUpdateMultiplicationCandidate).toHaveBeenCalledTimes(1)
    );
    expect(screen.queryByRole("alertdialog", { hidden: true })).toBeNull();
  });
});
