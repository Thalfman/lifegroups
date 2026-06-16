import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_GROUP_RUBRIC_CRITERIA } from "@/lib/admin/health-rubric";

// The editor binds a "use server" action; stub it so static rendering never
// pulls server-only deps (the markup never invokes the action anyway).
vi.mock("@/app/(protected)/admin/settings/actions", () => ({
  adminSetHealthRubric: vi.fn(),
}));

import { HealthRubricEditor } from "@/components/admin/settings/health-rubric-editor";

describe("HealthRubricEditor (#642)", () => {
  it("shows the working defaults summing to 100, not a zeroed 0/100, when unsaved", () => {
    const html = renderToStaticMarkup(
      <HealthRubricEditor
        criteria={DEFAULT_GROUP_RUBRIC_CRITERIA}
        hasSavedRubric={false}
      />
    );

    expect(html).toContain("Total: 100 / 100");
    expect(html).not.toContain("Total: 0 / 100");
    // The three default criteria are pre-filled.
    expect(html).toContain('value="Attendance"');
    expect(html).toContain('value="Spiritual growth"');
    expect(html).toContain('value="Group question"');
    // The starting-defaults note explains they're tunable and unpersisted.
    expect(html).toContain("These are starting defaults");
  });

  it("omits the starting-defaults note once a rubric has been saved", () => {
    const html = renderToStaticMarkup(
      <HealthRubricEditor
        criteria={DEFAULT_GROUP_RUBRIC_CRITERIA}
        hasSavedRubric
      />
    );

    expect(html).not.toContain("These are starting defaults");
  });
});
