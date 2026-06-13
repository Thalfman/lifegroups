// Local toolchain preflight (#545). The canonical verification scripts (lint,
// typecheck, test:run, test:a11y) shell out to project-local command shims in
// node_modules/.bin. When a package is present but its shim is not — a damaged
// or partial install — those scripts fail with misleading noise ("'vitest' is
// not recognized", stale TypeScript parse output) that sends humans and AFK
// agents chasing phantom code problems. This preflight runs FIRST and, on a
// missing shim, fails once with a concrete remediation path instead.
//
// It is intentionally a plain-Node ESM script invoked via `node`, NOT `tsx`:
// the whole point is to diagnose missing shims, and `tsx` is itself a shim. It
// depends on nothing outside Node's standard library, so it runs even when the
// rest of the local toolchain is broken. The pure helpers are exported (typed
// by verify-toolchain.d.mts) so the unit test can exercise them directly.

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// The local tool shims the canonical verification scripts depend on, each
// paired with the npm script that needs it (so remediation can name it).
export const REQUIRED_TOOLS = [
  { label: "ESLint", bin: "eslint", script: "lint" },
  { label: "TypeScript (tsc)", bin: "tsc", script: "typecheck" },
  { label: "Vitest", bin: "vitest", script: "test:run" },
  { label: "Playwright", bin: "playwright", script: "test:a11y" },
];

// On Windows, npm writes `<bin>.cmd` / `<bin>.ps1` wrappers alongside the bare
// shim; any one of them means the tool is runnable.
const SHIM_SUFFIXES = ["", ".cmd", ".CMD", ".ps1", ".bat"];

// True when a runnable shim for `bin` exists in `binDir`.
export function shimExists(binDir, bin) {
  return SHIM_SUFFIXES.some((suffix) =>
    existsSync(path.join(binDir, `${bin}${suffix}`))
  );
}

// Check that every required tool shim is present in `binDir`. Pure: no process
// exit, no logging — callers decide what to do with the result.
export function checkToolchain(args) {
  const tools = args.tools ?? REQUIRED_TOOLS;
  const missing = [];
  const present = [];
  for (const tool of tools) {
    if (shimExists(args.binDir, tool.bin)) present.push(tool);
    else missing.push(tool);
  }
  return { ok: missing.length === 0, missing, present };
}

// A concrete, one-screen remediation message naming every missing shim, the
// script that needs it, and the exact command to repair the install.
export function formatRemediation(missing) {
  const lines = missing.map(
    (tool) =>
      `  • ${tool.label} (node_modules/.bin/${tool.bin}) — needed by \`npm run ${tool.script}\``
  );
  return [
    "Local toolchain check failed: project command shims are missing.",
    "",
    "Missing:",
    ...lines,
    "",
    "A package can be installed while its node_modules/.bin shim is not,",
    "which surfaces as misleading errors (e.g. \"'vitest' is not recognized\"",
    "or stale TypeScript parse output) rather than a clear cause.",
    "",
    "Repair the project-local install, then re-run the command:",
    "  npm ci        # preferred — exact, clean install from package-lock.json",
    "  npm install   # only if you mean to update the lockfile",
    "",
    "This preflight inspects only this project's node_modules/.bin, never",
    "globally installed tools.",
  ].join("\n");
}

// Absolute path to this project's node_modules/.bin (repo root is one level up
// from scripts/).
export function defaultBinDir() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, "..", "node_modules", ".bin");
}

// CLI entry: check the default bin dir; on failure print remediation to stderr
// and exit non-zero so the `&&`-chained tool never runs. Silent on success to
// keep the canonical scripts' output clean.
export function main() {
  const result = checkToolchain({ binDir: defaultBinDir() });
  if (!result.ok) {
    console.error(formatRemediation(result.missing));
    process.exit(1);
  }
}

// Run only when invoked directly (`node scripts/verify-toolchain.mjs`), not
// when imported by the unit test.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
