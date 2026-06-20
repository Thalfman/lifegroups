import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(protected)/admin/launch-planning/actions", () => ({
  adminArchiveMultiplicationCandidate: vi.fn(),
  adminCreateMultiplicationCandidate: vi.fn(),
  adminUpdateMultiplicationCandidate: vi.fn(),
}));

import { MultiplicationPlanner } from "@/components/admin/multiplication/multiplication-planner";

describe("MultiplicationPlanner", () => {
  it("disables Add to pipeline until a group is selected", () => {
    const html = renderToStaticMarkup(
      <MultiplicationPlanner
        segments={[]}
        suggestions={[]}
        groupOptions={[
          { id: "g1", name: "Wednesday Westside", groupType: "Men's" },
        ]}
        apprenticesByGroup={{}}
      />
    );

    expect(html).toContain("Select a group to enable Add to pipeline.");
    expect(html).toMatch(
      /<button[^>]*disabled=""[^>]*>Add to pipeline<\/button>/
    );
  });

  it("shows an empty-state when no groups are available to add", () => {
    const html = renderToStaticMarkup(
      <MultiplicationPlanner
        segments={[]}
        suggestions={[]}
        groupOptions={[]}
        apprenticesByGroup={{}}
      />
    );

    expect(html).toContain("No active groups available to add");
  });

  // ADR 0030 removed the Meeting time + Members-entered controls from the form,
  // but those columns stay (dormant — no data deletion) and the update RPC
  // writes them unconditionally. The edit form must therefore re-post the
  // candidate's existing values, or a save (e.g. ticking a readiness box) would
  // null them out. The edit form renders behind a row's expand toggle (not in
  // static markup) and CandidateEditForm isn't exported, so guard the regression
  // by scanning the source for the seeded hidden inputs.
  it("re-posts the dormant meeting_time + manual_member_count on edit (ADR 0030, no data deletion)", () => {
    const src = readFileSync(
      fileURLToPath(new URL("../multiplication-planner.tsx", import.meta.url)),
      "utf8"
    );
    expect(src).toContain('name="meeting_time" value={c.meetingTime ?? ""}');
    expect(src).toContain('name="manual_member_count"');
    expect(src).toContain('value={c.manualMemberCount ?? ""}');
  });
});
