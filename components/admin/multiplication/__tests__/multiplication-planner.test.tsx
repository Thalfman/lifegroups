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
});
