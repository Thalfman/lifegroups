import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Each group-detail tab points at the right workflow so no tab is a silent
// dead end. The People tab edits the roster in place (GroupRosterManager) —
// its empty states teach the inline control and its removal copy promises the
// person stays in People; the other tabs keep their contextual cross-links.

const PAGE = readFileSync(
  fileURLToPath(new URL("../page.tsx", import.meta.url)),
  "utf8"
);

// The tab panels' markup lives in the presentational view (#822); the page is
// guard + spine load + hand-off.
const VIEW = readFileSync(
  fileURLToPath(
    new URL(
      "../../../../../../components/admin/group-detail/group-detail-view.tsx",
      import.meta.url
    )
  ),
  "utf8"
);

const ROSTER = readFileSync(
  fileURLToPath(
    new URL(
      "../../../../../../components/admin/group-detail/group-roster-manager.tsx",
      import.meta.url
    )
  ),
  "utf8"
);

describe("group detail tab actions", () => {
  it("teaches the inline assign control on the empty roster states", () => {
    expect(ROSTER).toContain("No shepherd assigned yet");
    expect(ROSTER).toContain("No active members on the roster");
    expect(ROSTER).toContain("assign one below");
  });

  it("gates the People cross-link on nav visibility", () => {
    expect(PAGE).toContain("loadHiddenNavAreas");
    expect(PAGE).toContain("hiddenNavAreas={[...hiddenNavAreas]}");
    expect(ROSTER).toContain("peopleHidden ? null");
    expect(ROSTER).toContain("Manage everyone in People →");
  });

  it("removal copy promises the person stays in People", () => {
    expect(ROSTER).toContain(
      "They stay in People — this only ends the group assignment."
    );
  });

  it("reads archived groups as read-only with a restore hint", () => {
    expect(ROSTER).toContain("Restore the group");
  });

  it("links Attendance to the group calendar", () => {
    expect(VIEW).toMatch(
      /<TabAction href=\{`\/admin\/groups\/\$\{groupId\}\/calendar`\}>/
    );
    expect(VIEW).toContain("Open the group calendar →");
  });

  it("links Follow-ups to Care", () => {
    expect(VIEW).toContain('<TabAction href="/admin/care">Open Care →');
  });

  it("lets the Health tab edit in place and keeps the triage cross-link", () => {
    // The same shared editor drawer the triage uses, scoped to this group…
    expect(VIEW).toContain("<GroupHealthEditButton");
    // …with the all-groups triage still one link away.
    expect(VIEW).toContain('<Link href="/admin/group-health"');
    expect(VIEW).toContain("Group health triage");
  });
});
