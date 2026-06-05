import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Group detail stays read-only — editing lives on the canonical People / Group
// health / Care / calendar workflows. These guards pin the contextual actions
// that point each tab (and its empty states) at the right workflow, so the tabs
// don't become silent dead ends.

const PAGE = readFileSync(
  fileURLToPath(new URL("../page.tsx", import.meta.url)),
  "utf8"
);

describe("group detail tab actions", () => {
  it("offers a People action on the empty leader and member states", () => {
    expect(PAGE).toContain("No leader assigned yet.");
    expect(PAGE).toContain("Assign a leader in People →");
    expect(PAGE).toContain("No active members on the roster.");
    expect(PAGE).toContain("Add a member in People →");
    // Both point at the canonical People workflow.
    expect(PAGE).toMatch(/<TabAction href="\/admin\/people">/);
  });

  it("keeps a persistent People link on the People tab", () => {
    expect(PAGE).toContain("Manage leaders &amp; members in People →");
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
