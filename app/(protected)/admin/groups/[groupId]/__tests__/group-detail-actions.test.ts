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
    expect(ROSTER).toContain("No leader assigned yet");
    expect(ROSTER).toContain("No active members on the roster");
    expect(ROSTER).toContain("assign one below");
  });

  it("keeps a persistent People cross-link on the People tab", () => {
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
    expect(PAGE).toMatch(
      /<TabAction href=\{`\/admin\/groups\/\$\{groupId\}\/calendar`\}>/
    );
    expect(PAGE).toContain("Open the group calendar →");
  });

  it("links Follow-ups to Care", () => {
    expect(PAGE).toContain('<TabAction href="/admin/care">Open Care →');
  });

  it("keeps the Health tab pointed at Group health triage", () => {
    expect(PAGE).toContain('<Link href="/admin/group-health"');
    expect(PAGE).toContain("Group health triage");
  });
});
