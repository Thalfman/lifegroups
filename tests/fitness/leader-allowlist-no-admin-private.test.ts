import { describe, expect, it } from "vitest";

import { DATA_CLASSIFICATION } from "@/lib/security/data-classification";
import { readSourceFiles, stripComments } from "./support/source-globber";

// Leader private-note guard (issue #699). `admin_private_note` (and every other
// admin-private column) must never reach a leader surface or a leader-route read
// allowlist. RLS is row-level, so these columns ride along on rows a leader can
// see; the named-column read allowlists are the defensive boundary that keeps
// them off the `/leader` surface (see lib/supabase/follow-up-reads.ts).

// Admin-private column names from the manifest.
const adminPrivateColumns: readonly string[] = [
  ...new Set(
    DATA_CLASSIFICATION.flatMap((t) =>
      (t.columns ?? [])
        .filter((c) => c.classification === "admin_private")
        .map((c) => c.column)
    )
  ),
].sort();

// snake_case → camelCase (admin_private_note → adminPrivateNote), so a view
// model that maps the DB column onto a camelCase prop is still caught.
function toCamel(snake: string): string {
  return snake.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

// The unambiguous `admin_*` subset — safe to scan as bare tokens across leader
// source without false-tripping on a generic `notes`/`note` identifier. Always
// includes the issue's named target, in both snake_case and camelCase forms.
const adminTokenColumns = [
  ...new Set(
    [
      "admin_private_note",
      ...adminPrivateColumns.filter((c) => c.includes("admin")),
    ].flatMap((c) => [c, toCamel(c)])
  ),
].sort();

// The `/leader` ROLE surfaces (the lowest oversight tier). Over-shepherd/admin
// surfaces legitimately see more, so they are NOT scanned here.
const LEADER_SURFACE = readSourceFiles({
  roots: ["app/(protected)/leader", "lib/leader"],
  extensions: [".ts", ".tsx"],
  exclude: ["/__tests__/", ".test.ts", ".test.tsx"],
});

describe("fitness: leader surfaces never expose an admin-private column", () => {
  it("finds leader-surface source and admin-private columns (sanity)", () => {
    expect(LEADER_SURFACE.length).toBeGreaterThan(0);
    expect(adminTokenColumns).toContain("admin_private_note");
  });

  it("no /leader source references an admin_* private column", () => {
    const offenders: string[] = [];
    for (const file of LEADER_SURFACE) {
      const code = stripComments(file.text);
      for (const col of adminTokenColumns) {
        if (new RegExp(`\\b${col}\\b`).test(code)) {
          offenders.push(`  ${file.relPath}  references "${col}"`);
        }
      }
    }
    expect(
      offenders,
      offenders.length === 0
        ? ""
        : `Admin-private columns must never reach a leader surface:\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});

describe("fitness: LEADER_FOLLOW_UP_COLUMNS excludes admin-private columns", () => {
  const READS = readSourceFiles({
    roots: ["lib/supabase/follow-up-reads.ts"],
    extensions: [".ts"],
  });

  it("the leader follow-up read allowlist is present", () => {
    expect(READS.length).toBe(1);
  });

  it("LEADER_FOLLOW_UP_COLUMNS lists no admin-private column, and the row type omits it", () => {
    const text = stripComments(READS[0].text);
    const start = text.indexOf("LEADER_FOLLOW_UP_COLUMNS");
    expect(start, "constant must exist").toBeGreaterThan(-1);
    const value = text.slice(
      text.indexOf("=", start),
      text.indexOf(";", start)
    );
    // Real column tokens from the concatenated string-literal allowlist.
    const columns = value
      .replace(/["'+]/g, " ")
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    // Sanity: this really is the leader-safe list (includes the leader-visible
    // note, which is sensitive_care, NOT admin_private — so it's allowed).
    expect(columns).toContain("leader_visible_note");

    const leaked = columns.filter((c) => adminPrivateColumns.includes(c));
    expect(
      leaked,
      `LEADER_FOLLOW_UP_COLUMNS must not select admin-private columns: ${leaked.join(", ")}`
    ).toEqual([]);

    // The compile-time half of the boundary: the row type omits the column.
    expect(READS[0].text).toContain('Omit<FollowUpsRow, "admin_private_note">');
  });
});
