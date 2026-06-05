import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Accessibility guard for the multiplication planner's inline per-candidate edit
// form. Its field labels used to be bare `<label style={fieldLabelStyle}>` with
// no `htmlFor`, so the visible name wasn't programmatically tied to its control.
// Each edit field now derives a unique id from the candidate id (`fid(name)`)
// and the label points at it, so the association survives several candidates
// rendering their edit forms at once. (The add-candidate form already used
// static `mc-*` ids — left as-is.)

const SRC = readFileSync(
  fileURLToPath(new URL("../multiplication-planner.tsx", import.meta.url)),
  "utf8"
);

describe("multiplication inline-edit field labels", () => {
  it("derives per-candidate field ids from the candidate id", () => {
    expect(SRC).toMatch(/const fid = \(name: string\) =>/);
    expect(SRC).toContain("`mc-edit-${c.candidateId}-${name}`");
  });

  it("ties every inline-edit label to its control via fid()", () => {
    for (const field of [
      "target_year",
      "status",
      "successor_designate",
      "meeting_time",
      "leader_pipeline_id",
      "notes",
    ]) {
      expect(SRC).toContain(`htmlFor={fid("${field}")}`);
      expect(SRC).toContain(`id={fid("${field}")}`);
    }
  });

  it("leaves no field label without a programmatic association", () => {
    // A bare single-line field label (no htmlFor) would regress accessibility.
    expect(SRC).not.toMatch(/<label style=\{fieldLabelStyle\}>/);
  });
});
