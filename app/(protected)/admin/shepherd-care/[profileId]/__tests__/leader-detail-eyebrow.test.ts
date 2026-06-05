import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Vocabulary: the individual leader's care page is reached from the "Care" hub
// (nav + /admin/care), so its eyebrow reads "Care" to match where the admin
// came from rather than the lone "Leader care" outlier. (The dashboard
// LeaderCareOverviewCard and the over-shepherd surfaces keep their own
// deliberate wording — not touched here.)

const PAGE = readFileSync(
  fileURLToPath(new URL("../page.tsx", import.meta.url)),
  "utf8"
);

describe("leader care detail eyebrow", () => {
  it('uses the "Care" eyebrow to match the hub', () => {
    expect(PAGE).toContain('eyebrow="Care"');
  });

  it('drops the "Leader care" eyebrow outlier', () => {
    expect(PAGE).not.toContain('eyebrow="Leader care"');
  });
});
