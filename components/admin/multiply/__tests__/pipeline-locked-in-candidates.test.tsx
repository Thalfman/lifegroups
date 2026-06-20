// @vitest-environment jsdom
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { actionOk, actionFail } from "@/lib/shared/action-result";
import {
  evaluateReadiness,
  type CandidateView,
} from "@/lib/admin/multiplication";

// Remove maps to the audited soft-archive action; stub the "use server" module.
const adminArchiveMultiplicationCandidate = vi.fn(
  async (_prev: unknown, _formData: FormData) => actionOk({ id: "cand-1" })
);
vi.mock("@/app/(protected)/admin/launch-planning/actions", () => ({
  adminArchiveMultiplicationCandidate: (prev: unknown, formData: FormData) =>
    adminArchiveMultiplicationCandidate(prev, formData),
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
