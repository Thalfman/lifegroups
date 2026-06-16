import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Accessibility guard for the multiplication planner's candidate forms. Field
// labels used to be bare `<label style={fieldLabelStyle}>` with no `htmlFor`, so
// the visible name wasn't programmatically tied to its control. The add and
// inline-edit forms now share one set of field components, each deriving its
// element id from a prefix (`fieldId(idPrefix, name)`) and pointing its label at
// it — so the association survives several candidates rendering their edit forms
// at once. The inline-edit form passes a per-candidate prefix; the add form
// passes "mc-add".

const SRC = readFileSync(
  fileURLToPath(new URL("../multiplication-planner.tsx", import.meta.url)),
  "utf8"
);

describe("multiplication candidate field labels", () => {
  it("derives every shared field id from a prefix", () => {
    expect(SRC).toMatch(/function fieldId\(prefix: string, name: string\)/);
    expect(SRC).toContain("`${prefix}-${name}`");
  });

  it("scopes the inline-edit fields to the candidate id", () => {
    expect(SRC).toContain("const idPrefix = `mc-edit-${c.candidateId}`");
  });

  it("ties every labeled field to its control via the derived id", () => {
    // Each shared field component computes `const id = fieldId(idPrefix, name)`
    // then renders `htmlFor={id}` + `id={id}`, plus the inline apprentice select.
    for (const field of [
      "target_year",
      "status",
      "successor_designate",
      "meeting_time",
      "manual_member_count",
      "leader_pipeline_id",
      "notes",
    ]) {
      expect(SRC).toContain(`fieldId(idPrefix, "${field}")`);
    }
    expect(SRC).toContain("htmlFor={id}");
    expect(SRC).toContain("id={id}");
  });

  it("leaves no field label without a programmatic association", () => {
    // A bare single-line field label (no htmlFor) would regress accessibility.
    expect(SRC).not.toMatch(/<label style=\{fieldLabelStyle\}>/);
  });
});
