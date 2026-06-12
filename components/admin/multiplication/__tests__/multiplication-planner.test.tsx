import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(protected)/admin/launch-planning/actions", () => ({
  adminArchiveMultiplicationCandidate: vi.fn(),
  adminCreateMultiplicationCandidate: vi.fn(),
  adminUpdateMultiplicationCandidate: vi.fn(),
}));

import { MultiplicationPlanner } from "@/components/admin/multiplication/multiplication-planner";
import { groupTypeKey } from "@/lib/admin/audience";

describe("MultiplicationPlanner", () => {
  it("disables Add to pipeline until a group type is selected", () => {
    const typeKey = groupTypeKey("men", "category-1");
    const html = renderToStaticMarkup(
      <MultiplicationPlanner
        segments={[]}
        suggestions={[]}
        typeOptions={[
          {
            audienceCategory: "men",
            categoryId: "category-1",
            label: "20s",
          },
        ]}
        groupsByType={{ [typeKey]: [] }}
        apprenticesByGroup={{}}
      />
    );

    expect(html).toContain("Select a group type to enable Add to pipeline.");
    expect(html).toMatch(
      /<button[^>]*disabled=""[^>]*>Add to pipeline<\/button>/
    );
  });
});
