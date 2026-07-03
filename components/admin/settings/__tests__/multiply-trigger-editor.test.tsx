import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(protected)/admin/settings/actions", () => ({
  adminSetReadinessRule: vi.fn(),
}));

import {
  MultiplyTriggerEditor,
  readinessCountsValid,
} from "@/components/admin/settings/multiply-trigger-editor";
import type { ReadinessRule } from "@/lib/admin/cell-readiness";

const RULE: ReadinessRule = {
  interest: { required: true, min: 8 },
  capacity: { required: false },
  groupHealth: { required: false, min: "C" },
  leaderHealth: { required: false, min: "C" },
  memberCount: { required: false, min: 0 },
  groupTenure: { required: false, min: 0 },
  coShepherdTenure: { required: false, min: 0 },
};

describe("readinessCountsValid", () => {
  it("rejects an emptied required count instead of coercing it to 0", () => {
    expect(readinessCountsValid([[true, ""]])).toBe(false);
    expect(readinessCountsValid([[true, "abc"]])).toBe(false);
  });

  it("accepts numeric required counts and ignores non-required ones", () => {
    expect(readinessCountsValid([[true, "8"]])).toBe(true);
    expect(readinessCountsValid([[true, "0"]])).toBe(true);
    // Not required: an empty value is fine (input is disabled).
    expect(readinessCountsValid([[false, ""]])).toBe(true);
    expect(
      readinessCountsValid([
        [true, "8"],
        [false, ""],
        [true, "2"],
      ])
    ).toBe(true);
  });
});

describe("MultiplyTriggerEditor", () => {
  it("enables Save with a valid rule and no gating hint", () => {
    const html = renderToStaticMarkup(
      <MultiplyTriggerEditor
        ministryYear={2026}
        globalRule={RULE}
        storedRuleFellBack={false}
      />
    );

    expect(html).toContain("Save readiness rule</button>");
    // The disabled *attribute* (Tailwind's disabled: class variants remain).
    expect(html).not.toMatch(
      /<button[^>]*disabled=""[^>]*>Save readiness rule<\/button>/
    );
    expect(html).not.toContain(
      "Enter a number for each required pillar to enable Save."
    );
  });
});
