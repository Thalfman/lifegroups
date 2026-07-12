import { describe, expect, it } from "vitest";

import { readSourceFiles } from "./support/source-globber";

const CI_WORKFLOW_PATH = ".github/workflows/ci.yml";

const CANONICAL_RLS_GATE_PATHS = [
  ".github/workflows/ci.yml",
  ".github/workflows/rls-integration.yml",
  "app/**/*actions.ts",
  "lib/**/*read*.ts",
  "lib/**/*rpc*.ts",
  "lib/account/own-name.ts",
  "lib/admin/permanent-deletion.ts",
  "lib/auth/**",
  "lib/security/data-classification.ts",
  "package-lock.json",
  "package.json",
  "supabase/config.toml",
  "supabase/functions/**",
  "supabase/migrations/**",
  "supabase/seed/**",
  "tests/fitness/**",
  "tests/integration/**",
  "types/**",
  "vitest.integration.config.ts",
  "vitest.shared.ts",
] as const;

const workflow = readSourceFiles({
  roots: [CI_WORKFLOW_PATH],
  extensions: [".yml"],
}).find((file) => file.relPath === CI_WORKFLOW_PATH);

function readRlsGatePaths(source: string): string[] {
  const filterBlock = source.match(
    /filters:\s*\|\s*\r?\n\s*rls:\s*\r?\n((?:\s*-\s*"[^"]+"[^\r\n]*\r?\n?)*)/
  );
  if (!filterBlock) return [];

  return [...filterBlock[1].matchAll(/^\s*-\s*"([^"]+)"/gm)]
    .map((match) => match[1])
    .sort();
}

describe("fitness: the required RLS harness watches every controlling input", () => {
  it("finds the required CI workflow and its rls path filter", () => {
    expect(workflow, `${CI_WORKFLOW_PATH} should exist`).toBeDefined();
    expect(readRlsGatePaths(workflow?.text ?? "").length).toBeGreaterThan(0);
  });

  it("pins the complete canonical RLS gate path set", () => {
    const actual = readRlsGatePaths(workflow?.text ?? "");
    const expected = [...CANONICAL_RLS_GATE_PATHS].sort();

    expect(
      actual,
      "The step-level RLS gate is part of the required CI context. Keep all " +
        "schema, runtime, harness, dependency, toolchain, and workflow inputs " +
        "in this canonical set so a relevant PR cannot skip the live checks."
    ).toEqual(expected);
  });
});
