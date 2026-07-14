import { describe, expect, it } from "vitest";

import { readSourceFiles, type SourceFile } from "./support/source-globber";

const INVENTORY_PATH = "docs/store/data-inventory.md";
const PRIVACY_PATH = "app/privacy/page.tsx";

const CURRENT_SOURCE_PATHS = [
  INVENTORY_PATH,
  PRIVACY_PATH,
  "docs/store/reviewer-demo-seed.md",
  "docs/runbooks/LAUNCH_RUNBOOK.md",
  "supabase/seed/reviewer_demo_seed.sql",
  "lib/admin/__tests__/reviewer-demo-seed.test.ts",
] as const;

const currentSources = readSourceFiles({
  roots: [...CURRENT_SOURCE_PATHS],
  extensions: [".md", ".sql", ".ts", ".tsx"],
});

const byPath = new Map(
  currentSources.map((source) => [source.relPath, source] as const)
);

const RETIRED_MODEL: ReadonlyArray<{
  readonly label: string;
  readonly pattern: RegExp;
}> = [
  {
    label: "Audience x Category model",
    pattern: /\baudience\s*(?:x|\u00d7|and)\s*category\b/i,
  },
  { label: "retired cell noun", pattern: /\bcell(?:s)?\b/i },
  { label: "group_categories table", pattern: /\bgroup_categories\b/ },
  {
    label: "category_type_targets table",
    pattern: /\bcategory_type_targets\b/,
  },
];

function sourceAt(path: string): SourceFile | undefined {
  return byPath.get(path);
}

describe("fitness: current privacy canon uses free-text group types", () => {
  it("finds every current source in the group-type canon", () => {
    expect([...byPath.keys()].sort()).toEqual([...CURRENT_SOURCE_PATHS].sort());
  });

  it("keeps retired cell-model terms out of current privacy sources", () => {
    const hits = currentSources.flatMap((source) =>
      RETIRED_MODEL.filter(({ pattern }) => pattern.test(source.text)).map(
        ({ label }) => `${source.relPath}: ${label}`
      )
    );

    expect(
      hits,
      "These current sources feed public/store privacy disclosures. Historical " +
        "ADRs and audits may retain old terms, but these files must describe " +
        "the shipped free-text group-type model."
    ).toEqual([]);
  });

  it("names the canonical persisted fields in the store inventory", () => {
    const inventory = sourceAt(INVENTORY_PATH)?.text ?? "";
    expect(inventory).toContain("`groups.group_type`");
    expect(inventory).toContain("`prospects.desired_group_type`");
  });

  it("renders group-type wording in the public privacy page", () => {
    const privacy = sourceAt(PRIVACY_PATH)?.text ?? "";
    expect(privacy).toMatch(/group type/i);
    expect(privacy).toMatch(/desired group type/i);
  });
});
