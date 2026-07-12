import { describe, expect, it } from "vitest";

import { readSourceFiles } from "./support/source-globber";

const WORKFLOW_PATH = ".github/workflows/e2e.yml";
const EXPENSIVE_GATE =
  "github.event_name != 'pull_request' || steps.e2e-paths.outputs.e2e == 'true'";

const CANONICAL_E2E_PATHS = [
  ".github/workflows/e2e.yml",
  ".nvmrc",
  "app/**",
  "components/**",
  "lib/**",
  "next.config.ts",
  "package-lock.json",
  "package.json",
  "playwright.e2e.config.ts",
  "proxy.ts",
  "scripts/e2e.sh",
  "scripts/ensure-local-edge-env.sh",
  "scripts/seed-test-auth-users.ts",
  "scripts/patch-next-react-dom-36134.mjs",
  "scripts/seeded-local-stack.sh",
  "scripts/test-auth-shared.ts",
  "supabase/functions/**",
  "supabase/config.toml",
  "supabase/migrations/**",
  "supabase/seed/**",
  "tests/e2e/**",
  "tsconfig.json",
  "types/**",
] as const;

const workflow = readSourceFiles({
  roots: [WORKFLOW_PATH],
  extensions: [".yml"],
}).find((file) => file.relPath === WORKFLOW_PATH);

function triggerBlock(source: string, trigger: string): string {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => line === `  ${trigger}:`);
  if (start < 0) return "";
  const end = lines.findIndex(
    (line, index) => index > start && /^  \S/.test(line)
  );
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n");
}

function readE2eGatePaths(source: string): string[] {
  const filterBlock = source.match(
    /filters:\s*\|\s*\r?\n\s*e2e:\s*\r?\n((?:\s*-\s*"[^"]+"[^\r\n]*\r?\n?)*)/
  );
  if (!filterBlock) return [];
  return [...filterBlock[1].matchAll(/^\s*-\s*"([^"]+)"/gm)]
    .map((match) => match[1])
    .sort();
}

function stepBlock(source: string, stepName: string): string {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex(
    (line) => line.trim() === `- name: ${stepName}`
  );
  if (start < 0) return "";
  const end = lines.findIndex(
    (line, index) => index > start && /^\s*- (?:name:|uses:)/.test(line)
  );
  return lines.slice(start, end < 0 ? undefined : end).join("\n");
}

describe("fitness: E2E is an always-reporting PR context", () => {
  it("finds the E2E workflow", () => {
    expect(workflow, `${WORKFLOW_PATH} should exist`).toBeDefined();
  });

  it("does not path-filter the pull_request trigger", () => {
    expect(triggerBlock(workflow?.text ?? "", "pull_request")).not.toMatch(
      /^\s*paths:/m
    );
  });

  it("pins the runtime and harness inputs for the internal expensive gate", () => {
    expect(readE2eGatePaths(workflow?.text ?? "")).toEqual(
      [...CANONICAL_E2E_PATHS].sort()
    );
  });

  it.each([
    "Install dependencies",
    "Install Playwright browser",
    "Install Supabase CLI",
    "Start local Supabase stack",
    "Run E2E lane",
  ])("gates the expensive '%s' step inside the reporting job", (stepName) => {
    expect(stepBlock(workflow?.text ?? "", stepName)).toContain(
      `if: ${EXPENSIVE_GATE}`
    );
  });

  it("stops Supabase only when this job actually started it", () => {
    const start = stepBlock(workflow?.text ?? "", "Start local Supabase stack");
    const stop = stepBlock(workflow?.text ?? "", "Stop local Supabase stack");
    expect(start).toContain("id: supabase-start");
    expect(start).toContain('echo "started=true" >> "$GITHUB_OUTPUT"');
    expect(stop).toContain(
      "if: always() && steps.supabase-start.outputs.started == 'true'"
    );
  });
  it("prepares the ignored local Edge secret before starting Supabase", () => {
    const start = stepBlock(workflow?.text ?? "", "Start local Supabase stack");
    expect(start).toContain(". ./scripts/ensure-local-edge-env.sh");
    expect(start.indexOf(". ./scripts/ensure-local-edge-env.sh")).toBeLessThan(
      start.indexOf("supabase start")
    );
  });
});
