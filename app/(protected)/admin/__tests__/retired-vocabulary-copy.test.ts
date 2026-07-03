import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// #809 — regression guards for the last rendered strings that contradicted the
// ratified vocabulary (ADR 0025 Shepherd copy; the group-type model). These are
// source-level guards on the exact copy strings, mirroring the pattern in
// care-follow-ups-shepherd-buckets.test.tsx: the retired phrasing must never
// come back, and the corrected phrasing must stay present so the assertion
// can't rot into a vacuous not-contains.

function source(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8"
  );
}

describe("Multiply page lede speaks of group types, not cells (#809)", () => {
  const PAGE = source("../multiply/page.tsx");

  it("says which group types are ready", () => {
    expect(PAGE).toContain("which group types are ready");
  });

  it("never reverts to the retired cells phrasing", () => {
    expect(PAGE).not.toContain("which cells are ready");
    expect(PAGE).not.toMatch(/\bcells?\b/i);
  });
});

describe("Danger-zone card intros enumerate shepherds, not leaders (#809)", () => {
  const LAUNCH_PREP = source(
    "../../../../components/admin/launch-prep-card.tsx"
  );
  const CLEAN_SLATE = source(
    "../../../../components/admin/clean-slate-card.tsx"
  );
  const RESET_ALL = source("../../../../components/admin/reset-all-card.tsx");

  it("launch-prep card keeps the shepherds enumeration", () => {
    expect(LAUNCH_PREP).toContain(
      "People, groups, shepherds, memberships, settings, care profiles & notes, and the audit log are kept"
    );
    expect(LAUNCH_PREP).not.toContain("groups, leaders,");
  });

  it("clean-slate card keeps the same enumeration, so the siblings agree", () => {
    expect(CLEAN_SLATE).toContain(
      "People, groups, shepherds, memberships, settings, care profiles & notes, and the audit log are kept"
    );
    expect(CLEAN_SLATE).not.toContain("groups, leaders,");
  });

  it("reset-all card keeps the same enumeration and shepherd-care wording", () => {
    expect(RESET_ALL).toContain(
      "People, groups, shepherds, memberships, settings, care profiles & notes, and the audit log are kept"
    );
    expect(RESET_ALL).not.toContain("groups, leaders,");
    expect(RESET_ALL).not.toContain("leader-care");
  });
});
