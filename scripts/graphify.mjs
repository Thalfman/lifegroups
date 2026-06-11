#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const graphifyOutRoot = path.join(repoRoot, "graphify-out");
const workRoot = path.join(repoRoot, ".graphify");
const stageRoot = path.join(workRoot, "stage");
const overridesPath = path.join(repoRoot, "graphify", "community-labels.json");
const versionPath = path.join(repoRoot, ".graphify-version");

const sourceExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".sql",
]);

const codeExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

const sliceConfigs = {
  full: {
    label: "Full Architecture",
    seedPatterns: [/.*/],
  },
  plan: {
    label: "Plan and Launch Pipeline",
    seedPatterns: [
      /(^|\/)app\/\(protected\)\/admin\/plan\//,
      /(^|\/)app\/\(protected\)\/admin\/planning\//,
      /(^|\/)app\/\(protected\)\/admin\/launch-planning\//,
      /(^|\/)components\/admin\/plan\//,
      /(^|\/)components\/admin\/planning\//,
      /(^|\/)components\/admin\/launch-planning\//,
      /(^|\/)lib\/admin\/(planning|planning-views|launch-planning)\.ts$/,
      /(^|\/)lib\/admin\/validation\/launch-planning\.ts$/,
      /prospect|launch[-_]planning|scenario|apprentice|candidate/i,
    ],
  },
  multiply: {
    label: "Multiplication Readiness",
    seedPatterns: [
      /(^|\/)app\/\(protected\)\/admin\/multiply\//,
      /(^|\/)app\/\(protected\)\/admin\/launch-planning\//,
      /(^|\/)app\/\(protected\)\/admin\/leader-pipeline\//,
      /(^|\/)components\/admin\/multiply\//,
      /(^|\/)components\/admin\/multiplication\//,
      /(^|\/)components\/admin\/launch-planning\//,
      /(^|\/)lib\/admin\/(multiply|multiplication|multiply-grid|multiply-trigger|multiplication-pillars|launch-planning)\.ts$/,
      /(^|\/)lib\/supabase\/multiplication-config-reads\.ts$/,
      /multiply|multiplication|readiness|capacity|pillar|candidate|apprentice|leader[-_]pipeline/i,
    ],
  },
  care: {
    label: "Care and Shepherd Workflows",
    seedPatterns: [
      /(^|\/)app\/\(protected\)\/admin\/care\//,
      /(^|\/)app\/\(protected\)\/admin\/shepherd-care\//,
      /(^|\/)app\/\(protected\)\/admin\/follow-ups\//,
      /(^|\/)app\/\(protected\)\/leader\/.*\/care\//,
      /(^|\/)app\/\(protected\)\/over-shepherd\//,
      /(^|\/)components\/admin\/care\//,
      /(^|\/)components\/admin\/shepherd-care\//,
      /(^|\/)components\/admin\/follow-ups\//,
      /(^|\/)components\/over-shepherd\//,
      /(^|\/)lib\/admin\/(care|care-|shepherd-care|shepherd-care-|care-note|care-next|care-area|care-temporal|care-accordion|care-note-feed|care-note-visibility|member-care|follow-ups)/,
      /(^|\/)lib\/supabase\/(care|care-|shepherd-care|member-care|follow-up)/,
      /care|shepherd|follow[-_]up|private[-_]note|care[-_]note|over[-_]shepherd|leader[-_]health/i,
    ],
  },
  calendar: {
    label: "Calendar and Attendance",
    seedPatterns: [
      /(^|\/)app\/\(protected\)\/admin\/calendar\//,
      /(^|\/)app\/\(protected\)\/admin\/planning\//,
      /(^|\/)app\/\(protected\)\/admin\/check-ins\//,
      /(^|\/)app\/\(protected\)\/leader\/.*\/calendar\//,
      /(^|\/)app\/\(protected\)\/admin\/groups\/.*\/calendar\//,
      /(^|\/)components\/calendar\//,
      /(^|\/)components\/admin\/admin-master-calendar/,
      /(^|\/)lib\/calendar\//,
      /(^|\/)lib\/admin\/(master-calendar|master-calendar-label|check-ins)\.ts$/,
      /calendar|occurrence|event|check[-_]in|attendance|meeting|schedule/i,
    ],
  },
};

const domainConfigs = [
  {
    id: "auth",
    label: "Auth",
    command: "npm run domain:auth",
    layout: { x: -420, y: -260 },
    patterns: [
      /(^|\/)middleware\.ts$/,
      /(^|\/)lib\/auth\//,
      /(^|\/)app\/(login|auth|invite|forgot-password|reset-password)(\/|$)/,
      /auth|session|role|logout|login|password|invite/i,
    ],
  },
  {
    id: "groups",
    label: "Groups",
    command: "npm run domain:groups",
    layout: { x: -480, y: 0 },
    patterns: [
      /(^|\/)app\/\(protected\)\/admin\/groups(\/|$)/,
      /(^|\/)components\/admin\/groups?/,
      /group-|groups-|group_detail|group_roster|group_health|group_type/i,
    ],
  },
  {
    id: "people",
    label: "People",
    command: "npm run domain:people",
    layout: { x: -288, y: 0 },
    patterns: [
      /(^|\/)app\/\(protected\)\/admin\/people(\/|$)/,
      /(^|\/)components\/admin\/people(\/|$)/,
      /people|person|profile|guest|membership|member-detail|leader-detail/i,
    ],
  },
  {
    id: "plan",
    label: "Plan",
    command: "npm run domain:plan",
    layout: { x: -96, y: 0 },
    patterns: [
      /(^|\/)app\/\(protected\)\/admin\/(plan|planning|launch-planning)(\/|$)/,
      /(^|\/)components\/admin\/(plan|planning|launch-planning)(\/|$)/,
      /launch-planning|planning|prospect|scenario|apprentice|candidate/i,
    ],
  },
  {
    id: "multiply",
    label: "Multiply",
    command: "npm run domain:multiply",
    layout: { x: 96, y: 0 },
    patterns: [
      /(^|\/)app\/\(protected\)\/admin\/(multiply|leader-pipeline)(\/|$)/,
      /(^|\/)components\/admin\/(multiply|multiplication)(\/|$)/,
      /multiply|multiplication|readiness|capacity|pillar|leader-pipeline/i,
    ],
  },
  {
    id: "care",
    label: "Care",
    command: "npm run domain:care",
    layout: { x: 288, y: 0 },
    patterns: [
      /(^|\/)app\/\(protected\)\/admin\/(care|shepherd-care|follow-ups)(\/|$)/,
      /(^|\/)app\/\(protected\)\/over-shepherd(\/|$)/,
      /(^|\/)components\/admin\/(care|shepherd-care|follow-ups)(\/|$)/,
      /(^|\/)components\/over-shepherd(\/|$)/,
      /care|shepherd|follow-up|follow_ups|private-note|private_note|coverage/i,
    ],
  },
  {
    id: "calendar",
    label: "Calendar",
    command: "npm run domain:calendar",
    layout: { x: 480, y: 0 },
    patterns: [
      /(^|\/)app\/\(protected\)\/admin\/(calendar|check-ins)(\/|$)/,
      /(^|\/)components\/calendar(\/|$)/,
      /(^|\/)lib\/calendar(\/|$)/,
      /calendar|occurrence|event|check-in|attendance|meeting|schedule/i,
    ],
  },
  {
    id: "settings",
    label: "Settings",
    command: "npm run domain:settings",
    layout: { x: -360, y: 260 },
    patterns: [
      /(^|\/)app\/\(protected\)\/admin\/settings(\/|$)/,
      /(^|\/)components\/admin\/settings(\/|$)/,
      /settings|group-category|metric-default|readiness-rule|rubric/i,
    ],
  },
  {
    id: "super-admin",
    label: "Super Admin",
    command: "npm run domain:super-admin",
    layout: { x: -120, y: 260 },
    patterns: [
      /super-admin|permanent-delete|permanent-deletion|reset-all|platform-config|test-accounts|manage-test-auth-users/i,
    ],
  },
  {
    id: "supabase",
    label: "Supabase/Data",
    command: "npm run domain:supabase",
    layout: { x: 120, y: 260 },
    patterns: [
      /(^|\/)lib\/supabase(\/|$)/,
      /(^|\/)supabase\/(functions|migrations|seed)(\/|$)/,
      /(^|\/)lib\/admin\/rpc\.ts$/,
      /read-model|read-models|safeRpc|rpc\.ts/i,
    ],
  },
  {
    id: "shared-ui",
    label: "Shared UI",
    command: "npm run domain:shared-ui",
    layout: { x: 360, y: 260 },
    patterns: [
      /(^|\/)components\/ui(\/|$)/,
      /(^|\/)components\/lg(\/|$)/,
      /segmented-tabs|button|badge|dialog|shell|card|empty-state|skeleton/i,
    ],
  },
  {
    id: "app-shell",
    label: "App Shell",
    command: "node scripts/graphify.mjs domain app-shell",
    layout: { x: 0, y: -260 },
    patterns: [
      /(^|\/)app\/(layout|page|loading|error|not-found)\.[tj]sx?$/,
      /(^|\/)app\/\(protected\)\/(layout|page|loading|error)\.[tj]sx?$/,
      /(^|\/)lib\/dashboard(\/|$)/,
      /navigation|nav-items|dashboard|home-hub|layout|page-shell/i,
    ],
  },
  {
    id: "leader-workspace",
    label: "Leader Workspace",
    command: "node scripts/graphify.mjs domain leader-workspace",
    layout: { x: 420, y: -260 },
    patterns: [
      /(^|\/)app\/\(protected\)\/leader(\/|$)/,
      /(^|\/)components\/leader(\/|$)/,
      /(^|\/)lib\/leader(\/|$)/,
      /leader-workspace|leader-/i,
    ],
  },
];

const domainById = new Map(domainConfigs.map((domain) => [domain.id, domain]));

const palette = [
  "#4E79A7",
  "#F28E2B",
  "#E15759",
  "#76B7B2",
  "#59A14F",
  "#EDC948",
  "#B07AA1",
  "#FF9DA7",
  "#9C755F",
  "#BAB0AC",
  "#6B7280",
  "#2563EB",
  "#16A34A",
  "#DC2626",
  "#9333EA",
  "#0F766E",
];

const labelRules = [
  {
    label: "Admin Form Components",
    pattern: /components\/admin\/forms|lib\/forms|action-form|confirm-action/i,
  },
  {
    label: "Admin RPC Layer",
    pattern: /lib\/admin\/rpc\.ts|lib\/shared\/rpc\.ts|rpc\(\)|safeRpc/i,
  },
  {
    label: "Admin Action Runner",
    pattern:
      /lib\/admin\/run-action|lib\/shared\/run-action|lib\/admin\/action-result|lib\/shared\/action-result|runAction/i,
  },
  { label: "Admin Validation", pattern: /lib\/admin\/validation\//i },
  {
    label: "Supabase Data Access",
    pattern: /lib\/supabase|supabase.*reads|read-model|read-batch/i,
  },
  {
    label: "Private Notes Crypto",
    pattern: /lib\/crypto|private-notes-session|sealed-note|passkey/i,
  },
  {
    label: "Auth Flow",
    pattern:
      /(^|\/)lib\/auth\/|(^|\/)app\/(login|auth|invite|forgot-password|reset-password)\/|logoutAction|require[A-Za-z]+Session|middleware\.ts/i,
  },
  {
    label: "Group Management UI",
    pattern:
      /admin\/groups|groups-directory|group-detail|group-roster|group-health/i,
  },
  {
    label: "Plan Pipeline",
    pattern: /admin\/plan|prospect|planning|launch-planning|scenario/i,
  },
  {
    label: "Multiplication Readiness",
    pattern:
      /multiply|multiplication|pillar|readiness|capacity|candidate|apprentice/i,
  },
  {
    label: "Settings Actions",
    pattern:
      /settings\/actions|settings_|group-category|metric-default|readiness-rule/i,
  },
  {
    label: "Shepherd Care Workflows",
    pattern:
      /shepherd-care|over-shepherd|shepherd_care|leader-health|coverage/i,
  },
  {
    label: "Care Notes and Follow Ups",
    pattern:
      /care-note|care_notes|follow-up|follow_ups|private-notes|private_notes/i,
  },
  { label: "Calendar Pages", pattern: /calendar|occurrence|event|schedule/i },
  {
    label: "Check Ins and Attendance",
    pattern: /check-ins|check_ins|attendance/i,
  },
  {
    label: "Admin Dashboard Widgets",
    pattern: /components\/lg\/admin\/dashboard|lib\/dashboard/i,
  },
  {
    label: "Admin People Actions",
    pattern:
      /admin\/people\/actions|components\/admin\/people|person-detail|people-management|adminassign|admincreate(member|leader|ministry)|deactivate(member|profile)|membership/i,
  },
  { label: "Leader Workspace", pattern: /leader\/|leader-|leader_/i },
  {
    label: "Super Admin Console",
    pattern:
      /super-admin|permanent-delete|reset-all|platform-config|test-accounts/i,
  },
  {
    label: "Shared UI Primitives",
    pattern: /components\/ui|segmented-tabs|button|badge|dialog|shell|card/i,
  },
  { label: "Database Migrations", pattern: /supabase\/migrations|\.sql$/i },
];

function main() {
  const [command, ...args] = process.argv.slice(2);
  const cmd = command || "help";

  try {
    if (cmd === "help" || cmd === "--help" || cmd === "-h") {
      printHelp();
      return;
    }
    if (cmd === "clean") {
      clean();
      return;
    }
    if (cmd === "has-cli") {
      const bin = resolveGraphifyBin(false);
      if (!bin) process.exit(1);
      return;
    }
    if (cmd === "build") {
      buildSlice(args[0] || "full", parseOptions(args.slice(1)));
      return;
    }
    if (cmd === "domain") {
      buildDomainGraph(args[0], parseOptions(args.slice(1)));
      return;
    }
    if (sliceConfigs[cmd]) {
      buildSlice(cmd, parseOptions(args));
      return;
    }
    if (cmd === "tree") {
      buildTree(args[0] || "full");
      return;
    }
    if (cmd === "report") {
      writeCombinedReport();
      return;
    }
    if (cmd === "health") {
      runHealth(args[0] || "full");
      return;
    }
    console.error(`Unknown graphify command: ${cmd}`);
    printHelp();
    process.exit(1);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function printHelp() {
  console.log(`Usage:
  node scripts/graphify.mjs build <full|plan|multiply|care|calendar> [--include-tests] [--no-root-mirror]
  node scripts/graphify.mjs domain <auth|groups|people|plan|multiply|care|calendar|settings|super-admin|supabase|shared-ui>
  node scripts/graphify.mjs tree [full|plan|multiply|care|calendar]
  node scripts/graphify.mjs report
  node scripts/graphify.mjs clean

Generated graphs are written to graphify-out/<slice>/. The full graph is also
mirrored to graphify-out/. The default HTML view is the aggregate architecture
overview; the raw full graph is written as raw-full-graph.html for deep
inspection.`);
}

function parseOptions(args) {
  return {
    includeTests: args.includes("--include-tests"),
    noRootMirror: args.includes("--no-root-mirror"),
    quiet: args.includes("--quiet"),
  };
}

function buildSlice(slice, options = {}) {
  const config = sliceConfigs[slice];
  if (!config) {
    throw new Error(
      `Unknown graph slice "${slice}". Expected one of: ${Object.keys(sliceConfigs).join(", ")}`
    );
  }

  const graphifyBin = resolveGraphifyBin(true);
  assertGraphifyVersion(graphifyBin);

  const files = selectFilesForSlice(slice, options);
  if (files.length === 0) {
    throw new Error(`No files matched graph slice "${slice}".`);
  }

  const sliceStageDir = path.join(stageRoot, slice);
  const sliceOutDir = path.join(graphifyOutRoot, slice);
  safeRemove(sliceStageDir, workRoot);
  copyFilesToStage(files, sliceStageDir);

  log(options, `Staged ${files.length} files for ${slice} graph.`);
  runGraphify(graphifyBin, ["extract", sliceStageDir, "--max-workers", "1"], {
    quiet: options.quiet,
  });
  runGraphify(graphifyBin, ["cluster-only", sliceStageDir, "--no-label"], {
    quiet: options.quiet,
  });

  const generatedDir = path.join(sliceStageDir, "graphify-out");
  const graphJson = path.join(generatedDir, "graph.json");
  if (!fs.existsSync(graphJson)) {
    throw new Error(`Graphify did not write ${graphJson}`);
  }

  postprocessOutput(generatedDir, slice, files);
  runTreeForOutput(graphifyBin, generatedDir, slice, sliceStageDir, options);

  safeRemove(sliceOutDir, graphifyOutRoot);
  copyDirectory(generatedDir, sliceOutDir);

  if (slice === "full" && !options.noRootMirror) {
    mirrorFullOutput(sliceOutDir);
  }

  writeCombinedReport();
  log(
    options,
    `Wrote ${slice} graph to ${path.relative(repoRoot, sliceOutDir)}.`
  );
}

function buildDomainGraph(domainId, options = {}) {
  if (!domainId || !domainById.has(domainId)) {
    throw new Error(
      `Unknown graph domain "${domainId || ""}". Expected one of: ${domainConfigs
        .map((domain) => domain.id)
        .join(", ")}`
    );
  }

  const graphifyBin = resolveGraphifyBin(true);
  assertGraphifyVersion(graphifyBin);

  const files = selectFilesForDomain(domainId, options);
  if (files.length === 0) {
    throw new Error(`No files matched graph domain "${domainId}".`);
  }

  const slice = `domain-${domainId}`;
  const sliceStageDir = path.join(stageRoot, slice);
  const sliceOutDir = path.join(graphifyOutRoot, slice);
  safeRemove(sliceStageDir, workRoot);
  copyFilesToStage(files, sliceStageDir);

  log(options, `Staged ${files.length} files for ${domainId} domain graph.`);
  runGraphify(graphifyBin, ["extract", sliceStageDir, "--max-workers", "1"], {
    quiet: options.quiet,
  });
  runGraphify(graphifyBin, ["cluster-only", sliceStageDir, "--no-label"], {
    quiet: options.quiet,
  });

  const generatedDir = path.join(sliceStageDir, "graphify-out");
  const graphJson = path.join(generatedDir, "graph.json");
  if (!fs.existsSync(graphJson)) {
    throw new Error(`Graphify did not write ${graphJson}`);
  }

  postprocessOutput(generatedDir, slice, files);
  runTreeForOutput(graphifyBin, generatedDir, slice, sliceStageDir, options);

  safeRemove(sliceOutDir, graphifyOutRoot);
  copyDirectory(generatedDir, sliceOutDir);

  writeCombinedReport();
  log(
    options,
    `Wrote ${domainId} domain graph to ${path.relative(repoRoot, sliceOutDir)}.`
  );
}

function clean() {
  safeRemove(stageRoot, workRoot);
  safeRemove(path.join(workRoot, "tmp"), workRoot);
  console.log(
    "Removed Graphify staging folders under .graphify/. Generated graph outputs were left intact."
  );
}

function buildTree(slice) {
  const graphifyBin = resolveGraphifyBin(true);
  assertGraphifyVersion(graphifyBin);
  const outDir = outputDirForSlice(slice);
  if (!fs.existsSync(path.join(outDir, "graph.json"))) {
    throw new Error(
      `No graph exists at ${path.relative(repoRoot, outDir)}. Run npm run graph:${slice} first.`
    );
  }
  runTreeForOutput(graphifyBin, outDir, slice, repoRoot, {});
}

function runHealth(slice) {
  const graphifyBin = resolveGraphifyBin(true);
  assertGraphifyVersion(graphifyBin);
  const outDir = outputDirForSlice(slice);
  const graphJson = path.join(outDir, "graph.json");
  if (!fs.existsSync(graphJson)) {
    throw new Error(`No graph exists at ${path.relative(repoRoot, outDir)}.`);
  }
  runGraphify(
    graphifyBin,
    ["diagnose", "multigraph", "--graph", graphJson],
    {}
  );
  runGraphify(graphifyBin, ["benchmark", graphJson], {});
}

function runTreeForOutput(graphifyBin, outDir, slice, rootDir, options = {}) {
  runGraphify(
    graphifyBin,
    [
      "tree",
      "--graph",
      path.join(outDir, "graph.json"),
      "--output",
      path.join(outDir, "GRAPH_TREE.html"),
      "--root",
      rootDir,
      "--label",
      `lifegroups ${slice}`,
    ],
    { quiet: options.quiet }
  );
}

function selectFilesForSlice(slice, options) {
  const repoFiles = listRepoFiles();
  const candidates = repoFiles
    .filter((file) => isSourceCandidate(file, options))
    .sort((a, b) => a.localeCompare(b));

  if (slice === "full") return candidates;

  const candidateSet = new Set(candidates);
  const seeds = candidates.filter((file) => matchesSlice(file, slice));
  const selected = new Set(seeds);
  const queue = [...seeds];

  while (queue.length > 0) {
    const file = queue.shift();
    if (!codeExtensions.has(path.posix.extname(file))) continue;
    for (const importedFile of importedLocalFiles(file, candidateSet)) {
      if (!selected.has(importedFile)) {
        selected.add(importedFile);
        queue.push(importedFile);
      }
    }
  }

  for (const file of candidates) {
    if (file === "middleware.ts" || file === "types/enums.ts")
      selected.add(file);
  }

  return [...selected].sort((a, b) => a.localeCompare(b));
}

function selectFilesForDomain(domainId, options) {
  const repoFiles = listRepoFiles();
  const candidates = repoFiles
    .filter((file) => isSourceCandidate(file, options))
    .sort((a, b) => a.localeCompare(b));
  const candidateSet = new Set(candidates);
  const dependencyDomains = new Set([
    domainId,
    "auth",
    "supabase",
    "shared-ui",
    "app-shell",
  ]);

  const seeds = candidates.filter(
    (file) => classifyDomainForFile(file).id === domainId
  );
  const selected = new Set(seeds);
  const queue = [...seeds];

  while (queue.length > 0) {
    const file = queue.shift();
    if (!codeExtensions.has(path.posix.extname(file))) continue;
    for (const importedFile of importedLocalFiles(file, candidateSet)) {
      const importedDomain = classifyDomainForFile(importedFile).id;
      if (!dependencyDomains.has(importedDomain)) continue;
      if (!selected.has(importedFile)) {
        selected.add(importedFile);
        if (importedDomain === domainId) queue.push(importedFile);
      }
    }
  }

  for (const file of candidates) {
    if (file === "middleware.ts" || file === "types/enums.ts") {
      selected.add(file);
    }
  }

  return [...selected].sort((a, b) => a.localeCompare(b));
}

function listRepoFiles() {
  const result = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    {
      cwd: repoRoot,
      encoding: "utf8",
    }
  );
  if (result.status !== 0) {
    throw new Error(`git ls-files failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.split(/\r?\n/).map(toSlash).filter(Boolean);
}

function isSourceCandidate(file, options) {
  const p = toSlash(file);
  const lower = p.toLowerCase();
  const ext = path.posix.extname(p);

  if (!sourceExtensions.has(ext)) return false;
  if (!isArchitectureRoot(p)) return false;
  if (!options.includeTests && isTestPath(p)) return false;

  if (
    lower.startsWith("node_modules/") ||
    lower.startsWith("app/a11y-harness/") ||
    lower.startsWith(".next/") ||
    lower.startsWith("dist/") ||
    lower.startsWith("build/") ||
    lower.startsWith("out/") ||
    lower.startsWith("coverage/") ||
    lower.startsWith("graphify-out/") ||
    lower.startsWith(".graphify/") ||
    lower.startsWith("graphify/") ||
    lower.startsWith(".agents/") ||
    lower.startsWith(".claude/") ||
    lower.startsWith(".github/") ||
    lower.startsWith(".husky/") ||
    lower.startsWith("test-results/") ||
    lower.startsWith("playwright-report/") ||
    lower.startsWith("blob-report/") ||
    lower.startsWith("tmp/") ||
    lower.startsWith("temp/") ||
    lower.startsWith(".tmp/")
  ) {
    return false;
  }

  if (
    lower === "types/database.ts" ||
    lower === "next-env.d.ts" ||
    lower.endsWith(".d.ts") ||
    lower.endsWith(".generated.ts") ||
    lower.endsWith(".generated.tsx") ||
    lower.includes("/generated/") ||
    lower.includes("/__generated__/")
  ) {
    return false;
  }

  if (
    lower.endsWith("package-lock.json") ||
    lower.endsWith("pnpm-lock.yaml") ||
    lower.endsWith("yarn.lock") ||
    lower.endsWith("bun.lockb") ||
    lower.endsWith("skills-lock.json")
  ) {
    return false;
  }

  if (lower.startsWith("scripts/graphify")) return false;
  return true;
}

function isArchitectureRoot(file) {
  return (
    file.startsWith("app/") ||
    file.startsWith("components/") ||
    file.startsWith("lib/") ||
    file.startsWith("supabase/functions/") ||
    file.startsWith("supabase/migrations/") ||
    file.startsWith("supabase/seed/") ||
    file === "middleware.ts" ||
    file === "types/enums.ts"
  );
}

function isTestPath(file) {
  return /(^|\/)(__tests__|tests)(\/|$)|\.(test|spec)\.[cm]?[jt]sx?$/.test(
    file
  );
}

function matchesSlice(file, slice) {
  const normalized = toSlash(file);
  return sliceConfigs[slice].seedPatterns.some((pattern) =>
    pattern.test(normalized)
  );
}

function classifyDomainForNode(node) {
  return classifyDomain(node.source_file || node.id || node.label || "");
}

function classifyDomainForFile(file) {
  return classifyDomain(file);
}

function classifyDomain(value) {
  const normalized = toSlash(value).toLowerCase();
  const orderedDomainIds = [
    "supabase",
    "super-admin",
    "auth",
    "leader-workspace",
    "settings",
    "care",
    "calendar",
    "multiply",
    "plan",
    "people",
    "groups",
    "shared-ui",
    "app-shell",
  ];

  for (const domainId of orderedDomainIds) {
    const domain = domainById.get(domainId);
    if (domain.patterns.some((pattern) => pattern.test(normalized))) {
      return domain;
    }
  }

  return domainById.get("app-shell");
}

function importedLocalFiles(file, candidateSet) {
  const abs = path.join(repoRoot, file);
  if (!fs.existsSync(abs)) return [];

  const source = fs.readFileSync(abs, "utf8");
  const imports = [];
  const importRe =
    /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s*)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;

  for (const match of source.matchAll(importRe)) {
    const spec = match[1] || match[2];
    const resolved = resolveImport(file, spec, candidateSet);
    if (resolved) imports.push(resolved);
  }

  return imports;
}

function resolveImport(fromFile, spec, candidateSet) {
  if (!spec || (!spec.startsWith(".") && !spec.startsWith("@/"))) return null;

  const base = spec.startsWith("@/")
    ? spec.slice(2)
    : path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec));

  const directExt = path.posix.extname(base);
  const attempts = [];
  if (directExt) {
    attempts.push(base);
  } else {
    for (const ext of [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]) {
      attempts.push(`${base}${ext}`);
      attempts.push(`${base}/index${ext}`);
    }
  }

  return attempts.find((candidate) => candidateSet.has(candidate)) || null;
}

function copyFilesToStage(files, destinationRoot) {
  for (const file of files) {
    const source = path.join(repoRoot, file);
    const destination = path.join(destinationRoot, file);
    assertInside(destinationRoot, destination);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
}

function postprocessOutput(outDir, slice, stagedFiles) {
  const graphPath = path.join(outDir, "graph.json");
  const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
  const edges = graph.links || graph.edges || [];
  const nodes = graph.nodes || [];
  const overrides = readCommunityOverrides();
  const previousAnalysis = readAnalysis(outDir);
  const stagedFileCount =
    stagedFiles.length > 0
      ? stagedFiles.length
      : previousAnalysis?.stagedFileCount > 0
        ? previousAnalysis.stagedFileCount
        : uniqueSourceFileCount(graph);
  const analysis = analyzeGraph(graph, slice, stagedFileCount, overrides);
  const domainOverview = buildDomainOverview(nodes, edges, analysis);
  const communityOverview = buildCommunityOverview(nodes, edges, analysis);
  analysis.views = {
    raw: {
      label: slice === "full" ? "Raw Full Graph" : "Feature Graph",
      nodeCount: nodes.length,
      edgeCount: edges.length,
      path: slice === "full" ? "raw-full-graph.html" : "graph.html",
    },
    architecture: {
      label: "Architecture Overview",
      nodeCount: domainOverview.nodes.length,
      edgeCount: domainOverview.edges.length,
      defaultVisibleEdges: domainOverview.edges.filter(
        (edge) => !edge.hiddenByDefault
      ).length,
      path: "architecture-overview.html",
    },
    community: {
      label: "Community Overview",
      nodeCount: communityOverview.nodes.length,
      edgeCount: communityOverview.edges.length,
      defaultVisibleEdges: communityOverview.edges.filter(
        (edge) => !edge.hiddenByDefault
      ).length,
      path: "community-overview.html",
    },
  };

  fs.writeFileSync(
    path.join(outDir, ".graphify_labels.json"),
    JSON.stringify(analysis.labels, null, 2) + "\n"
  );
  fs.writeFileSync(
    path.join(outDir, ".graphify_analysis.json"),
    JSON.stringify(analysis, null, 2) + "\n"
  );
  fs.writeFileSync(
    path.join(outDir, "GRAPH_REPORT.md"),
    renderReport(analysis) + "\n"
  );

  if (slice === "full") {
    const architectureHtml = renderOverviewHtml(domainOverview, {
      title: "Architecture Overview",
      subtitle:
        "Default map: domains are collapsed first, node size shows total symbols, and edge width shows cross-domain relationships.",
    });
    fs.writeFileSync(
      path.join(outDir, "architecture-overview.html"),
      architectureHtml
    );
    fs.writeFileSync(path.join(outDir, "graph.html"), architectureHtml);
    fs.writeFileSync(
      path.join(outDir, "community-overview.html"),
      renderOverviewHtml(communityOverview, {
        title: "Community Overview",
        subtitle:
          "Detected Graphify communities collapsed to one node each. Tooltips and details preserve the original community ID.",
      })
    );
    fs.writeFileSync(
      path.join(outDir, "raw-full-graph.html"),
      renderHtml(nodes, edges, analysis, slice, {
        title: "Raw Full Graph",
        subtitle:
          "Deep inspection only. This is the complete Graphify graph and is not intended as the architecture overview.",
      })
    );
  } else {
    fs.writeFileSync(
      path.join(outDir, "graph.html"),
      renderHtml(nodes, edges, analysis, slice, {
        title: `${sliceConfigs[slice]?.label || titleFromPath(slice)} Feature Graph`,
        subtitle: "Feature or domain drilldown graph for focused inspection.",
      })
    );
  }
}

function analyzeGraph(graph, slice, stagedFileCount, overrides) {
  const nodes = graph.nodes || [];
  const edges = graph.links || graph.edges || [];
  const degrees = degreeMap(edges);
  const communities = new Map();

  for (const node of nodes) {
    const key = String(node.community ?? "unknown");
    if (!communities.has(key)) communities.set(key, []);
    communities.get(key).push(node);
  }

  const labels = {};
  const communityDetails = [];
  for (const [communityId, communityNodes] of [...communities.entries()].sort(
    compareCommunityIds
  )) {
    const manual = manualLabelFor(overrides, slice, communityId);
    const inferred = inferCommunityLabel(communityId, communityNodes, degrees);
    const label = manual || inferred.label || `Community ${communityId}`;
    const source = manual ? "manual" : inferred.label ? "inferred" : "fallback";
    labels[communityId] = label;
    communityDetails.push({
      id: communityId,
      label,
      source,
      basis: manual ? "graphify/community-labels.json" : inferred.basis,
      nodeCount: communityNodes.length,
      topFiles: topFiles(communityNodes, 8),
      topNodes: topNodes(communityNodes, degrees, 8),
      dominantFolders: dominantFolders(communityNodes, 5),
    });
  }

  const noise = suspectedNoise(nodes);
  return {
    slice,
    generatedAt: new Date().toISOString(),
    stagedFileCount,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    communityCount: communities.size,
    labels,
    topHubs: topNodes(nodes, degrees, 20),
    largestCommunities: [...communityDetails]
      .sort((a, b) => b.nodeCount - a.nodeCount)
      .slice(0, 20),
    communities: communityDetails.sort((a, b) => Number(a.id) - Number(b.id)),
    noise,
  };
}

function degreeMap(edges) {
  const degrees = new Map();
  for (const edge of edges) {
    const source = edge.source ?? edge.from;
    const target = edge.target ?? edge.to;
    if (source) degrees.set(source, (degrees.get(source) || 0) + 1);
    if (target) degrees.set(target, (degrees.get(target) || 0) + 1);
  }
  return degrees;
}

function readCommunityOverrides() {
  if (!fs.existsSync(overridesPath)) return {};
  return JSON.parse(fs.readFileSync(overridesPath, "utf8"));
}

function manualLabelFor(overrides, slice, communityId) {
  const sliceOverrides = overrides[slice] || {};
  const sharedOverrides = overrides.shared || {};
  return sliceOverrides[communityId] || sharedOverrides[communityId] || null;
}

function inferCommunityLabel(communityId, nodes, degrees) {
  const fileSignals = topFiles(nodes, 10)
    .map((file) => file.file)
    .join(" ");
  const folderSignals = dominantFolders(nodes, 6)
    .map((folder) => folder.folder)
    .join(" ");
  const nodeSignals = nodes
    .flatMap((node) => [node.source_file, node.label, node.id])
    .filter(Boolean)
    .join(" ");

  for (const rule of labelRules) {
    if (rule.pattern.test(fileSignals)) {
      return {
        label: refineLabel(rule.label, nodes),
        basis: `top files matched ${rule.pattern}`,
      };
    }
  }

  for (const rule of labelRules) {
    if (rule.pattern.test(folderSignals)) {
      return {
        label: refineLabel(rule.label, nodes),
        basis: `dominant folders matched ${rule.pattern}`,
      };
    }
  }

  for (const rule of labelRules) {
    if (rule.pattern.test(nodeSignals)) {
      return {
        label: refineLabel(rule.label, nodes),
        basis: `matched ${rule.pattern}`,
      };
    }
  }

  const folders = dominantFolders(nodes, 2);
  if (folders.length > 0) {
    return {
      label: titleFromPath(folders[0].folder),
      basis: `dominant folder ${folders[0].folder}`,
    };
  }

  const hubs = topNodes(nodes, degrees, 1);
  if (hubs.length > 0) {
    return {
      label: titleFromPath(hubs[0].label),
      basis: `top node ${hubs[0].label}`,
    };
  }

  return {
    label: `Community ${communityId}`,
    basis: "no dominant folder or hub",
  };
}

function refineLabel(label, nodes) {
  const files = nodes.map((node) => node.source_file || "").join(" ");
  if (label === "Supabase Data Access") {
    if (/care/i.test(files)) return "Supabase Care Data Access";
    if (/calendar|event/i.test(files)) return "Supabase Calendar Data Access";
    if (/prospect|plan|launch/i.test(files)) return "Supabase Plan Data Access";
    if (/multiply|multiplication/i.test(files))
      return "Supabase Multiplication Data Access";
  }
  if (
    label === "Shared Server Actions" &&
    /app\/\(protected\)\/admin\/settings\/actions/i.test(files)
  ) {
    return "Settings Actions";
  }
  return label;
}

function dominantFolders(nodes, limit) {
  const counts = new Map();
  for (const node of nodes) {
    const file = node.source_file;
    if (!file) continue;
    const folder = toSlash(path.posix.dirname(toSlash(file)));
    counts.set(folder, (counts.get(folder) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([folder, count]) => ({ folder, count }));
}

function topFiles(nodes, limit) {
  const counts = new Map();
  for (const node of nodes) {
    const file = node.source_file || "(unknown)";
    counts.set(file, (counts.get(file) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([file, count]) => ({ file, count }));
}

function topNodes(nodes, degrees, limit) {
  return nodes
    .map((node) => ({
      id: node.id,
      label: node.label || node.id,
      sourceFile: node.source_file || "",
      degree: degrees.get(node.id) || 0,
      community: String(node.community ?? "unknown"),
    }))
    .sort((a, b) => b.degree - a.degree || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function suspectedNoise(nodes) {
  const patterns = [
    { name: "node_modules", pattern: /(^|\/)node_modules(\/|$)/ },
    { name: "app/a11y-harness", pattern: /(^|\/)app\/a11y-harness(\/|$)/ },
    { name: ".next", pattern: /(^|\/)\.next(\/|$)/ },
    { name: "dist/build/out", pattern: /(^|\/)(dist|build|out)(\/|$)/ },
    { name: "coverage", pattern: /(^|\/)coverage(\/|$)/ },
    { name: "graphify-out", pattern: /(^|\/)graphify-out(\/|$)/ },
    { name: ".graphify", pattern: /(^|\/)\.graphify(\/|$)/ },
    {
      name: "Graphify tooling",
      pattern:
        /(^|\/)(graphify|scripts\/graphify|\.agents\/skills\/graphify)(\/|\.|$)/,
    },
    {
      name: "tests",
      pattern: /(^|\/)(__tests__|tests)(\/|$)|\.(test|spec)\.[cm]?[jt]sx?$/,
    },
    {
      name: "generated DB/types",
      pattern: /types\/database\.ts|next-env\.d\.ts|\.generated\.[cm]?[jt]sx?$/,
    },
    {
      name: "lock files",
      pattern:
        /(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb|skills-lock\.json)$/,
    },
    { name: "temp folders", pattern: /(^|\/)(tmp|temp|\.tmp)(\/|$)/ },
  ];

  return patterns.map(({ name, pattern }) => {
    const matches = nodes
      .map((node) => node.source_file || "")
      .filter((file) => pattern.test(toSlash(file)));
    return {
      name,
      count: matches.length,
      examples: [...new Set(matches)].slice(0, 8),
    };
  });
}

function buildDomainOverview(nodes, edges, analysis) {
  const productNodes = nodes.filter(isProductArchitectureNode);
  const productNodeById = new Map(productNodes.map((node) => [node.id, node]));
  const stats = new Map(
    domainConfigs.map((domain) => [
      domain.id,
      {
        id: domain.id,
        label: domain.label,
        command: domain.command,
        nodeCount: 0,
        files: new Set(),
        fileCounts: new Map(),
        communityCounts: new Map(),
        topNodes: [],
      },
    ])
  );

  for (const node of productNodes) {
    const domain = classifyDomainForNode(node);
    const item = stats.get(domain.id);
    item.nodeCount += 1;
    if (node.source_file) {
      item.files.add(toSlash(node.source_file));
      increment(item.fileCounts, toSlash(node.source_file));
    }
    increment(item.communityCounts, String(node.community ?? "unknown"));
  }

  const degrees = degreeMap(edges);
  for (const node of productNodes) {
    const domain = classifyDomainForNode(node);
    const item = stats.get(domain.id);
    item.topNodes.push({
      id: node.id,
      label: node.label || node.id,
      sourceFile: node.source_file || "",
      degree: degrees.get(node.id) || 0,
    });
  }

  const edgeMap = aggregateEdges(edges, productNodeById, (node) => {
    return classifyDomainForNode(node).id;
  });

  const viewNodes = domainConfigs.map((domain) => {
    const item = stats.get(domain.id);
    const fileCount = item.files.size;
    const topCommunities = topEntries(item.communityCounts, 5).map((entry) => ({
      id: entry.key,
      label: analysis.labels[entry.key] || `Community ${entry.key}`,
      count: entry.count,
    }));
    const color = palette[Math.abs(hashCode(domain.id)) % palette.length];
    return {
      id: domain.id,
      label: domain.label,
      groupLabel: domain.label,
      kind: "domain",
      x: domain.layout.x,
      y: domain.layout.y,
      fixed: true,
      color,
      command: domain.command,
      nodeCount: item.nodeCount,
      fileCount,
      symbolCount: item.nodeCount,
      size: sizeForCount(item.nodeCount, 28, 78),
      topFiles: topEntries(item.fileCounts, 8).map((entry) => ({
        file: entry.key,
        count: entry.count,
      })),
      topCommunities,
      topNodes: item.topNodes
        .sort((a, b) => b.degree - a.degree || a.label.localeCompare(b.label))
        .slice(0, 8),
    };
  });

  return {
    kind: "architecture",
    label: "Architecture Overview",
    rawNodeCount: nodes.length,
    rawEdgeCount: edges.length,
    productNodeCount: productNodes.length,
    nodes: viewNodes,
    edges: finalizeAggregateEdges(
      [...edgeMap.values()].sort(
        (a, b) => b.count - a.count || a.from.localeCompare(b.from)
      ),
      "architecture",
      "domain-edge"
    ),
  };
}

function buildCommunityOverview(nodes, edges, analysis) {
  const productNodes = nodes.filter(isProductArchitectureNode);
  const productNodeById = new Map(productNodes.map((node) => [node.id, node]));
  const stats = new Map();

  for (const node of productNodes) {
    const communityId = String(node.community ?? "unknown");
    if (!stats.has(communityId)) {
      stats.set(communityId, {
        id: communityId,
        label: analysis.labels[communityId] || `Community ${communityId}`,
        nodeCount: 0,
        files: new Set(),
        fileCounts: new Map(),
        domainCounts: new Map(),
      });
    }
    const item = stats.get(communityId);
    item.nodeCount += 1;
    if (node.source_file) {
      item.files.add(toSlash(node.source_file));
      increment(item.fileCounts, toSlash(node.source_file));
    }
    increment(item.domainCounts, classifyDomainForNode(node).id);
  }

  const grouped = new Map(domainConfigs.map((domain) => [domain.id, []]));
  for (const item of stats.values()) {
    const dominantDomainId =
      topEntries(item.domainCounts, 1)[0]?.key || "app-shell";
    const domain =
      domainById.get(dominantDomainId) || domainById.get("app-shell");
    grouped.get(domain.id).push(item);
  }

  const viewNodes = [];
  for (const domain of domainConfigs) {
    const items = (grouped.get(domain.id) || []).sort(
      (a, b) => b.nodeCount - a.nodeCount || a.label.localeCompare(b.label)
    );
    const startY = -420;
    const rowGap = 82;
    items.forEach((item, index) => {
      const color = palette[Math.abs(hashCode(domain.id)) % palette.length];
      viewNodes.push({
        id: item.id,
        label: item.label,
        groupLabel: domain.label,
        kind: "community",
        communityId: item.id,
        domainId: domain.id,
        domainLabel: domain.label,
        x: domain.layout.x,
        y: startY + index * rowGap,
        fixed: true,
        color,
        nodeCount: item.nodeCount,
        fileCount: item.files.size,
        symbolCount: item.nodeCount,
        size: sizeForCount(item.nodeCount, 14, 40),
        topFiles: topEntries(item.fileCounts, 8).map((entry) => ({
          file: entry.key,
          count: entry.count,
        })),
        topCommunities: [],
        topNodes: [],
      });
    });
  }

  const edgeMap = aggregateEdges(edges, productNodeById, (node) =>
    String(node.community ?? "unknown")
  );

  return {
    kind: "community",
    label: "Community Overview",
    rawNodeCount: nodes.length,
    rawEdgeCount: edges.length,
    productNodeCount: productNodes.length,
    nodes: viewNodes,
    edges: finalizeAggregateEdges(
      [...edgeMap.values()].sort(
        (a, b) => b.count - a.count || a.from.localeCompare(b.from)
      ),
      "community",
      "community-edge"
    ),
  };
}

function finalizeAggregateEdges(edges, kind, idPrefix) {
  const counts = edges.map((edge) => edge.count);
  const threshold =
    kind === "architecture"
      ? Math.max(8, Math.round(percentile(counts, 0.7)))
      : Math.max(4, Math.round(percentile(counts, 0.85)));
  return edges.map((edge, index) => ({
    ...edge,
    id: `${idPrefix}-${index}`,
    width: widthForCount(edge.count),
    hiddenByDefault: edge.count < threshold,
    visibilityThreshold: threshold,
  }));
}

function aggregateEdges(edges, nodeById, groupingFn) {
  const edgeMap = new Map();
  for (const edge of edges) {
    const sourceId = edge.source ?? edge.from;
    const targetId = edge.target ?? edge.to;
    const sourceNode = nodeById.get(sourceId);
    const targetNode = nodeById.get(targetId);
    if (!sourceNode || !targetNode) continue;
    const from = groupingFn(sourceNode);
    const to = groupingFn(targetNode);
    if (!from || !to || from === to) continue;
    const key = `${from} -> ${to}`;
    if (!edgeMap.has(key)) {
      edgeMap.set(key, {
        from,
        to,
        count: 0,
        relationCounts: new Map(),
        examples: [],
      });
    }
    const item = edgeMap.get(key);
    item.count += 1;
    increment(item.relationCounts, edge.relation || edge.label || "related");
    if (item.examples.length < 8) {
      item.examples.push({
        source: sourceNode.label || sourceId,
        target: targetNode.label || targetId,
        relation: edge.relation || edge.label || "related",
        file: edge.source_file || sourceNode.source_file || "",
      });
    }
  }

  for (const item of edgeMap.values()) {
    item.relations = topEntries(item.relationCounts, 5).map((entry) => ({
      relation: entry.key,
      count: entry.count,
    }));
    delete item.relationCounts;
  }

  return edgeMap;
}

function isProductArchitectureNode(node) {
  const file = toSlash(node.source_file || "");
  if (!file) return true;
  return !isProductArchitectureNoisePath(file);
}

function isProductArchitectureNoisePath(file) {
  const lower = toSlash(file).toLowerCase();
  return (
    lower.startsWith("app/a11y-harness/") ||
    lower.startsWith("node_modules/") ||
    lower.startsWith(".next/") ||
    lower.startsWith("dist/") ||
    lower.startsWith("build/") ||
    lower.startsWith("out/") ||
    lower.startsWith("coverage/") ||
    lower.startsWith("graphify-out/") ||
    lower.startsWith(".graphify/") ||
    lower.startsWith("graphify/") ||
    lower.startsWith(".agents/skills/graphify/") ||
    lower.startsWith("scripts/graphify") ||
    isTestPath(lower) ||
    lower === "types/database.ts" ||
    lower === "next-env.d.ts" ||
    lower.endsWith(".d.ts") ||
    lower.endsWith(".generated.ts") ||
    lower.endsWith(".generated.tsx") ||
    lower.includes("/generated/") ||
    lower.includes("/__generated__/")
  );
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function topEntries(map, limit) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function sizeForCount(count, min, max) {
  if (count <= 0) return Math.max(18, min - 8);
  return Math.max(min, Math.min(max, min + Math.sqrt(count) * 2.7));
}

function widthForCount(count) {
  return Math.max(1, Math.min(12, 1 + Math.sqrt(count) * 0.7));
}

function renderReport(analysis) {
  const lines = [];
  lines.push(`# Architecture Graph Report - ${analysis.slice}`);
  lines.push("");
  lines.push(`Generated: ${analysis.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push(`- Nodes: ${analysis.nodeCount}`);
  lines.push(`- Edges: ${analysis.edgeCount}`);
  lines.push(`- Communities: ${analysis.communityCount}`);
  lines.push(`- Staged files: ${analysis.stagedFileCount}`);
  if (analysis.views) {
    lines.push(
      `- Architecture overview nodes: ${analysis.views.architecture.nodeCount}`
    );
    lines.push(
      `- Architecture overview edges: ${analysis.views.architecture.edgeCount}`
    );
    lines.push(
      `- Architecture overview default visible edges: ${analysis.views.architecture.defaultVisibleEdges}`
    );
    lines.push(
      `- Community overview nodes: ${analysis.views.community.nodeCount}`
    );
    lines.push(
      `- Community overview edges: ${analysis.views.community.edgeCount}`
    );
    lines.push(
      `- Community overview default visible edges: ${analysis.views.community.defaultVisibleEdges}`
    );
  }
  lines.push("");

  lines.push("## Exclusion Audit");
  for (const item of analysis.noise) {
    const status = item.count === 0 ? "OK" : "CHECK";
    lines.push(`- ${status}: ${item.name}: ${item.count}`);
    if (item.examples.length > 0) {
      lines.push(`  - Examples: ${item.examples.join(", ")}`);
    }
  }
  lines.push("");

  lines.push("## Top Hubs");
  for (const hub of analysis.topHubs.slice(0, 12)) {
    lines.push(`- ${hub.label} (${hub.degree}) - ${hub.sourceFile}`);
  }
  lines.push("");

  lines.push("## Largest Communities");
  for (const community of analysis.largestCommunities.slice(0, 12)) {
    lines.push(
      `- ${community.label} (${community.nodeCount} nodes, ${community.source})`
    );
  }
  lines.push("");

  lines.push("## Inferred Community Labels");
  lines.push("| ID | Label | Source | Basis |");
  lines.push("| --- | --- | --- | --- |");
  for (const community of analysis.communities.slice(0, 40)) {
    lines.push(
      `| ${community.id} | ${community.label} | ${community.source} | ${sanitizeTableCell(community.basis || "")} |`
    );
  }
  lines.push("");

  lines.push("## Top Files Per Community");
  for (const community of analysis.largestCommunities.slice(0, 15)) {
    lines.push(`### ${community.label} (${community.id})`);
    for (const file of community.topFiles.slice(0, 6)) {
      lines.push(`- ${file.file} (${file.count})`);
    }
    lines.push("");
  }

  lines.push("## Label And Edge Controls");
  if (analysis.slice === "full") {
    lines.push(
      "- The default graph.html is architecture-overview.html, not the raw full graph."
    );
    lines.push(
      "- Raw Full Graph is kept as raw-full-graph.html for deep inspection only."
    );
    lines.push(
      "- Community Overview is kept as community-overview.html with original community IDs in details."
    );
  }
  lines.push("- Raw graph node labels are hidden by default except hubs.");
  lines.push(
    "- Use Show Labels, Hub Labels, Selected Community, Neighbor Labels, and Zoom Labels in graph.html."
  );
  lines.push(
    "- Edge labels are hidden by default. Select an edge or enable Edge Labels to inspect relationship types."
  );
  return lines.join("\n");
}

function renderHtml(nodes, edges, analysis, slice, options = {}) {
  const degrees = degreeMap(edges);
  const preparedNodes = nodes.map((node) => {
    const community = String(node.community ?? "unknown");
    const degree = degrees.get(node.id) || 0;
    const color = palette[Math.abs(hashCode(community)) % palette.length];
    return {
      id: node.id,
      label: node.label || node.id,
      source_file: node.source_file || "",
      file_type: node.file_type || "code",
      community,
      community_name: analysis.labels[community] || `Community ${community}`,
      degree,
      color: {
        background: color,
        border: color,
        highlight: { background: "#F8FAFC", border: color },
      },
      size: Math.max(8, Math.min(26, 8 + Math.sqrt(degree + 1) * 2.2)),
    };
  });

  const preparedEdges = edges.map((edge, index) => {
    const relation = edge.relation || edge.label || "related";
    return {
      id: index,
      from: edge.source ?? edge.from,
      to: edge.target ?? edge.to,
      relation,
      context: edge.context || "",
      confidence: edge.confidence || "",
      confidence_score: edge.confidence_score ?? "",
      source_file: edge.source_file || "",
      source_location: edge.source_location || "",
      weight: edge.weight || 1,
    };
  });

  const legend = analysis.communities
    .map((community) => ({
      id: String(community.id),
      label: community.label,
      count: community.nodeCount,
      source: community.source,
      basis: community.basis,
      color: palette[Math.abs(hashCode(String(community.id))) % palette.length],
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const hubDegree = Math.max(
    8,
    Math.round(
      percentile(
        preparedNodes.map((node) => node.degree),
        0.92
      )
    )
  );

  const title = options.title || `${sliceConfigs[slice]?.label || slice} Graph`;
  const subtitle =
    options.subtitle ||
    "Raw Graphify graph with label controls for focused inspection.";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>lifegroups ${escapeHtml(title)}</title>
<script src="https://unpkg.com/vis-network@9.1.6/standalone/umd/vis-network.min.js"></script>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; height: 100vh; display: flex; overflow: hidden; background: #101319; color: #e5e7eb; font-family: Arial, sans-serif; }
  #graph { flex: 1; min-width: 0; }
  #sidebar { width: 360px; background: #171b24; border-left: 1px solid #303746; display: flex; flex-direction: column; }
  #top { padding: 14px; border-bottom: 1px solid #303746; }
  #top h1 { margin: 0 0 8px; font-size: 15px; font-weight: 700; }
  #subtitle { margin-bottom: 8px; color: #9ca3af; font-size: 12px; line-height: 1.4; }
  #stats { color: #9ca3af; font-size: 12px; line-height: 1.5; }
  #search { width: 100%; margin-top: 10px; background: #0f131a; color: #f9fafb; border: 1px solid #374151; border-radius: 6px; padding: 8px 10px; font-size: 13px; }
  #search-results { display: none; max-height: 150px; overflow: auto; border-bottom: 1px solid #303746; padding: 6px 10px; }
  .search-item { padding: 5px 7px; border-radius: 5px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; }
  .search-item:hover { background: #242b38; }
  #controls { padding: 10px 14px; border-bottom: 1px solid #303746; display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
  #controls label { display: flex; align-items: center; gap: 7px; color: #d1d5db; font-size: 12px; }
  input[type="checkbox"] { width: 14px; height: 14px; accent-color: #60a5fa; }
  #info { padding: 14px; border-bottom: 1px solid #303746; max-height: 290px; overflow: auto; }
  #info h2 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; color: #9ca3af; }
  #info-content { font-size: 12px; line-height: 1.55; color: #d1d5db; }
  .field { margin: 0 0 6px; }
  .field b { color: #f9fafb; }
  .muted { color: #9ca3af; }
  .neighbor { display: block; padding: 4px 6px; margin: 3px 0; border-left: 3px solid #4b5563; border-radius: 4px; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .neighbor:hover { background: #242b38; }
  #legend-wrap { flex: 1; overflow: auto; padding: 12px 14px; }
  #legend-wrap h2 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; color: #9ca3af; }
  .legend-item { display: flex; align-items: center; gap: 8px; padding: 5px 4px; border-radius: 5px; cursor: pointer; font-size: 12px; }
  .legend-item:hover { background: #242b38; }
  .legend-item.dimmed { opacity: 0.38; }
  .legend-dot { width: 12px; height: 12px; border-radius: 999px; flex: 0 0 auto; }
  .legend-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .legend-count { color: #9ca3af; font-size: 11px; }
</style>
</head>
<body>
<div id="graph"></div>
<aside id="sidebar">
  <div id="top">
    <h1>${escapeHtml(title)}</h1>
    <div id="subtitle">${escapeHtml(subtitle)}</div>
    <div id="stats">${preparedNodes.length} nodes - ${preparedEdges.length} edges - ${legend.length} communities - hub label degree ${hubDegree}</div>
    <input id="search" type="search" placeholder="Search nodes">
  </div>
  <div id="search-results"></div>
  <div id="controls">
    <label><input id="show-labels" type="checkbox"> Show Labels</label>
    <label><input id="hub-labels" type="checkbox" checked> Hub Labels</label>
    <label><input id="community-labels" type="checkbox" checked> Selected Community</label>
    <label><input id="neighbor-labels" type="checkbox" checked> Neighbor Labels</label>
    <label><input id="zoom-labels" type="checkbox" checked> Zoom Labels</label>
    <label><input id="edge-labels" type="checkbox"> Edge Labels</label>
  </div>
  <div id="info">
    <h2>Selection</h2>
    <div id="info-content"><span class="muted">Click a node or edge to inspect it.</span></div>
  </div>
  <div id="legend-wrap">
    <h2>Communities</h2>
    <div id="legend"></div>
  </div>
</aside>
<script>
const RAW_NODES = ${safeJson(preparedNodes)};
const RAW_EDGES = ${safeJson(preparedEdges)};
const LEGEND = ${safeJson(legend)};
const HUB_DEGREE = ${hubDegree};

const byId = new Map(RAW_NODES.map(function(n) { return [n.id, n]; }));
const adjacency = new Map();
RAW_EDGES.forEach(function(e) {
  if (!adjacency.has(e.from)) adjacency.set(e.from, []);
  if (!adjacency.has(e.to)) adjacency.set(e.to, []);
  adjacency.get(e.from).push({ edge: e, neighbor: e.to, direction: "out" });
  adjacency.get(e.to).push({ edge: e, neighbor: e.from, direction: "in" });
});

const state = {
  scale: 1,
  selectedCommunity: null,
  neighborIds: new Set(),
  hiddenCommunities: new Set(),
};

function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function(ch) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[ch];
  });
}

function labelEnabled(node) {
  if (document.getElementById("show-labels").checked) return true;
  if (document.getElementById("hub-labels").checked && node.degree >= HUB_DEGREE) return true;
  if (document.getElementById("community-labels").checked && node.community === state.selectedCommunity) return true;
  if (document.getElementById("neighbor-labels").checked && state.neighborIds.has(node.id)) return true;
  if (document.getElementById("zoom-labels").checked && state.scale >= 1.35 && node.degree >= Math.max(3, Math.round(HUB_DEGREE / 3))) return true;
  return false;
}

function nodeFont(node) {
  return { size: labelEnabled(node) ? 12 : 0, color: "#f9fafb", strokeWidth: 3, strokeColor: "#111827" };
}

function edgeLabel(edge) {
  return document.getElementById("edge-labels").checked ? edge.relation : "";
}

function edgeTitle(edge) {
  const source = byId.get(edge.from);
  const target = byId.get(edge.to);
  return [
    (source ? source.label : edge.from) + " -> " + (target ? target.label : edge.to),
    "Relation: " + edge.relation,
    edge.context ? "Context: " + edge.context : "",
    edge.confidence ? "Confidence: " + edge.confidence : "",
    edge.source_file ? "Source: " + edge.source_file + (edge.source_location ? " " + edge.source_location : "") : "",
  ].filter(Boolean).join("\\n");
}

const nodesDS = new vis.DataSet(RAW_NODES.map(function(n) {
  return {
    id: n.id,
    label: n.label,
    title: esc(n.label) + "\\n" + esc(n.community_name) + "\\n" + esc(n.source_file),
    color: n.color,
    size: n.size,
    font: nodeFont(n),
    _community: n.community,
    _community_name: n.community_name,
    _source_file: n.source_file,
    _file_type: n.file_type,
    _degree: n.degree,
  };
}));

const edgesDS = new vis.DataSet(RAW_EDGES.map(function(e) {
  return {
    id: e.id,
    from: e.from,
    to: e.to,
    label: edgeLabel(e),
    title: edgeTitle(e),
    width: Math.max(1, Math.min(4, Number(e.weight || 1))),
    color: { color: "#475569", highlight: "#93c5fd", hover: "#93c5fd", opacity: 0.45 },
    arrows: { to: { enabled: true, scaleFactor: 0.45 } },
    _relation: e.relation,
    _context: e.context,
    _confidence: e.confidence,
    _source_file: e.source_file,
    _source_location: e.source_location,
  };
}));

const network = new vis.Network(document.getElementById("graph"), { nodes: nodesDS, edges: edgesDS }, {
  physics: {
    enabled: true,
    solver: "forceAtlas2Based",
    forceAtlas2Based: { gravitationalConstant: -65, centralGravity: 0.006, springLength: 120, springConstant: 0.07, damping: 0.45, avoidOverlap: 0.8 },
    stabilization: { iterations: 220, fit: true },
  },
  interaction: { hover: true, tooltipDelay: 80, hideEdgesOnDrag: true },
  nodes: { shape: "dot", borderWidth: 1.5 },
  edges: { smooth: { type: "continuous", roundness: 0.18 }, selectionWidth: 3 },
});

network.once("stabilizationIterationsDone", function() {
  network.setOptions({ physics: { enabled: false } });
});

network.on("zoom", function(params) {
  state.scale = params.scale;
  refreshLabels();
});

network.on("click", function(params) {
  if (params.nodes && params.nodes.length) {
    showNode(params.nodes[0]);
    return;
  }
  if (params.edges && params.edges.length) {
    showEdge(params.edges[0]);
    return;
  }
  state.selectedCommunity = null;
  state.neighborIds.clear();
  refreshLabels();
  document.getElementById("info-content").innerHTML = '<span class="muted">Click a node or edge to inspect it.</span>';
});

function refreshLabels() {
  nodesDS.update(RAW_NODES.map(function(n) { return { id: n.id, font: nodeFont(n) }; }));
}

function refreshEdgeLabels() {
  edgesDS.update(RAW_EDGES.map(function(e) { return { id: e.id, label: edgeLabel(e) }; }));
}

function showNode(nodeId) {
  const node = byId.get(nodeId);
  if (!node) return;
  const neighbors = adjacency.get(nodeId) || [];
  state.selectedCommunity = node.community;
  state.neighborIds = new Set(neighbors.map(function(item) { return item.neighbor; }));
  state.neighborIds.add(nodeId);
  refreshLabels();

  const rows = neighbors.slice(0, 30).map(function(item) {
    const neighbor = byId.get(item.neighbor);
    const edge = item.edge;
    const color = neighbor && neighbor.color ? neighbor.color.background : "#64748b";
    const arrow = item.direction === "out" ? "->" : "<-";
    return '<span class="neighbor" style="border-left-color:' + color + '" onclick="focusNode(' + JSON.stringify(item.neighbor).replace(/"/g, "&quot;") + ')">' +
      esc(arrow + " " + edge.relation + " " + (neighbor ? neighbor.label : item.neighbor)) +
      '</span>';
  }).join("");

  document.getElementById("info-content").innerHTML =
    '<div class="field"><b>' + esc(node.label) + '</b></div>' +
    '<div class="field">Community: ' + esc(node.community_name) + '</div>' +
    '<div class="field">Source: ' + esc(node.source_file || "-") + '</div>' +
    '<div class="field">Type: ' + esc(node.file_type || "unknown") + '</div>' +
    '<div class="field">Degree: ' + node.degree + '</div>' +
    (neighbors.length ? '<div class="field muted">Neighbors (' + neighbors.length + ')</div>' + rows : "");
}

function showEdge(edgeId) {
  const edge = edgesDS.get(edgeId);
  if (!edge) return;
  const source = byId.get(edge.from);
  const target = byId.get(edge.to);
  state.selectedCommunity = source ? source.community : null;
  state.neighborIds = new Set([edge.from, edge.to]);
  refreshLabels();
  document.getElementById("info-content").innerHTML =
    '<div class="field"><b>' + esc(source ? source.label : edge.from) + ' -> ' + esc(target ? target.label : edge.to) + '</b></div>' +
    '<div class="field">Relation: ' + esc(edge._relation || "-") + '</div>' +
    '<div class="field">Context: ' + esc(edge._context || "-") + '</div>' +
    '<div class="field">Confidence: ' + esc(edge._confidence || "-") + '</div>' +
    '<div class="field">Source: ' + esc(edge._source_file || "-") + (edge._source_location ? " " + esc(edge._source_location) : "") + '</div>';
}

function focusNode(nodeId) {
  network.focus(nodeId, { scale: 1.45, animation: true });
  network.selectNodes([nodeId]);
  showNode(nodeId);
}

for (const id of ["show-labels", "hub-labels", "community-labels", "neighbor-labels", "zoom-labels"]) {
  document.getElementById(id).addEventListener("change", refreshLabels);
}
document.getElementById("edge-labels").addEventListener("change", refreshEdgeLabels);

const searchInput = document.getElementById("search");
const searchResults = document.getElementById("search-results");
searchInput.addEventListener("input", function() {
  const q = searchInput.value.toLowerCase().trim();
  searchResults.innerHTML = "";
  if (!q) { searchResults.style.display = "none"; return; }
  const matches = RAW_NODES.filter(function(n) {
    return n.label.toLowerCase().includes(q) || n.source_file.toLowerCase().includes(q) || n.community_name.toLowerCase().includes(q);
  }).slice(0, 30);
  if (!matches.length) { searchResults.style.display = "none"; return; }
  searchResults.style.display = "block";
  matches.forEach(function(n) {
    const el = document.createElement("div");
    el.className = "search-item";
    el.textContent = n.label + " - " + n.source_file;
    el.style.borderLeft = "3px solid " + n.color.background;
    el.onclick = function() {
      searchInput.value = "";
      searchResults.style.display = "none";
      focusNode(n.id);
    };
    searchResults.appendChild(el);
  });
});

const legendEl = document.getElementById("legend");
LEGEND.forEach(function(c) {
  const item = document.createElement("div");
  item.className = "legend-item";
  item.title = c.source + ": " + (c.basis || "");
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = true;
  cb.addEventListener("change", function(event) {
    event.stopPropagation();
    if (cb.checked) state.hiddenCommunities.delete(c.id); else state.hiddenCommunities.add(c.id);
    item.classList.toggle("dimmed", !cb.checked);
    nodesDS.update(RAW_NODES.filter(function(n) { return n.community === c.id; }).map(function(n) { return { id: n.id, hidden: !cb.checked }; }));
  });
  item.appendChild(cb);
  item.insertAdjacentHTML("beforeend", '<span class="legend-dot" style="background:' + c.color + '"></span><span class="legend-label">' + esc(c.label) + '</span><span class="legend-count">' + c.count + '</span>');
  item.addEventListener("click", function(event) {
    if (event.target === cb) return;
    state.selectedCommunity = c.id;
    state.neighborIds.clear();
    refreshLabels();
    const ids = RAW_NODES.filter(function(n) { return n.community === c.id && !state.hiddenCommunities.has(c.id); }).map(function(n) { return n.id; });
    if (ids.length) {
      network.selectNodes(ids.slice(0, 100));
      network.fit({ nodes: ids, animation: true });
    }
  });
  legendEl.appendChild(item);
});
</script>
</body>
</html>
`;
}

function renderOverviewHtml(view, options = {}) {
  const title = options.title || view.label;
  const subtitle = options.subtitle || "";
  const isArchitecture = view.kind === "architecture";
  const preparedNodes = view.nodes.map((node) => ({
    ...node,
    title: [
      node.label,
      node.kind === "community" ? `Community ID: ${node.communityId}` : "",
      `Group: ${node.groupLabel || node.domainLabel || node.label}`,
      `Symbols: ${node.symbolCount}`,
      `Files: ${node.fileCount}`,
      node.command ? `Command: ${node.command}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  }));
  const preparedEdges = view.edges.map((edge) => ({
    ...edge,
    title: [
      `${edge.from} -> ${edge.to}`,
      `Relationships: ${edge.count}`,
      edge.relations?.length
        ? `Relations: ${edge.relations
            .map((relation) => `${relation.relation} (${relation.count})`)
            .join(", ")}`
        : "",
      edge.examples?.length
        ? `Examples: ${edge.examples
            .slice(0, 3)
            .map(
              (example) =>
                `${example.source} -> ${example.target} (${example.relation})`
            )
            .join("; ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
  }));
  const defaultVisibleEdges = preparedEdges.filter(
    (edge) => !edge.hiddenByDefault
  ).length;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>lifegroups ${escapeHtml(title)}</title>
<script src="https://unpkg.com/vis-network@9.1.6/standalone/umd/vis-network.min.js"></script>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; height: 100vh; display: flex; overflow: hidden; background: #0f1218; color: #e5e7eb; font-family: Arial, sans-serif; }
  #graph { flex: 1; min-width: 0; background: radial-gradient(circle at center, #161b24 0, #0f1218 62%); }
  #sidebar { width: 380px; background: #171b24; border-left: 1px solid #303746; display: flex; flex-direction: column; }
  #top { padding: 14px; border-bottom: 1px solid #303746; }
  #top h1 { margin: 0 0 8px; font-size: 16px; font-weight: 700; }
  #subtitle { margin-bottom: 10px; color: #aab2c0; font-size: 12px; line-height: 1.45; }
  #stats { color: #9ca3af; font-size: 12px; line-height: 1.55; }
  #controls { padding: 10px 14px; border-bottom: 1px solid #303746; display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
  #controls label { display: flex; align-items: center; gap: 7px; color: #d1d5db; font-size: 12px; }
  input[type="checkbox"] { width: 14px; height: 14px; accent-color: #60a5fa; }
  #info { padding: 14px; border-bottom: 1px solid #303746; max-height: 46vh; overflow: auto; }
  #info h2, #list h2 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; color: #9ca3af; }
  #info-content { font-size: 12px; line-height: 1.55; color: #d1d5db; }
  .field { margin: 0 0 7px; }
  .field b { color: #f9fafb; }
  .muted { color: #9ca3af; }
  .pill { display: inline-block; margin: 2px 4px 2px 0; padding: 2px 6px; border: 1px solid #3f4758; border-radius: 999px; color: #d1d5db; font-size: 11px; }
  a { color: #93c5fd; text-decoration: none; }
  a:hover { text-decoration: underline; }
  #list { flex: 1; overflow: auto; padding: 12px 14px; }
  .list-item { display: grid; grid-template-columns: 14px 1fr auto; gap: 8px; align-items: center; padding: 6px 4px; border-radius: 5px; cursor: pointer; font-size: 12px; }
  .list-item:hover { background: #242b38; }
  .dot { width: 11px; height: 11px; border-radius: 999px; }
  .label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .count { color: #9ca3af; font-size: 11px; }
</style>
</head>
<body>
<div id="graph"></div>
<aside id="sidebar">
  <div id="top">
    <h1>${escapeHtml(title)}</h1>
    <div id="subtitle">${escapeHtml(subtitle)}</div>
    <div id="stats">
      ${preparedNodes.length} aggregate nodes - ${preparedEdges.length} aggregate edges<br>
      ${defaultVisibleEdges} edges shown by default; toggle Weak Edges for all<br>
      ${view.productNodeCount} product nodes from ${view.rawNodeCount} raw nodes<br>
      ${view.rawEdgeCount} raw relationships collapsed by ${isArchitecture ? "domain" : "community"}
    </div>
  </div>
  <div id="controls">
    <label><input id="show-labels" type="checkbox" checked> Labels</label>
    <label><input id="edge-counts" type="checkbox"> Edge Counts</label>
    <label><input id="weak-edges" type="checkbox"> Weak Edges</label>
    <label><input id="fit-view" type="checkbox" checked> Fit On Load</label>
    <label><input id="highlight-neighbors" type="checkbox" checked> Neighbors</label>
  </div>
  <div id="info">
    <h2>Selection</h2>
    <div id="info-content"><span class="muted">Click an aggregate node or edge to inspect counts and examples.</span></div>
  </div>
  <div id="list">
    <h2>${isArchitecture ? "Domains" : "Communities"}</h2>
    <div id="node-list"></div>
  </div>
</aside>
<script>
const RAW_NODES = ${safeJson(preparedNodes)};
const RAW_EDGES = ${safeJson(preparedEdges)};
const IS_ARCHITECTURE = ${safeJson(isArchitecture)};
const byId = new Map(RAW_NODES.map(function(node) { return [node.id, node]; }));
const edgeById = new Map(RAW_EDGES.map(function(edge) { return [edge.id, edge]; }));
const adjacency = new Map();
RAW_EDGES.forEach(function(edge) {
  if (!adjacency.has(edge.from)) adjacency.set(edge.from, new Set());
  if (!adjacency.has(edge.to)) adjacency.set(edge.to, new Set());
  adjacency.get(edge.from).add(edge.to);
  adjacency.get(edge.to).add(edge.from);
});

function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function(ch) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[ch];
  });
}

function nodeFont() {
  return {
    size: document.getElementById("show-labels").checked ? (IS_ARCHITECTURE ? 16 : 11) : 0,
    color: "#f9fafb",
    strokeWidth: 4,
    strokeColor: "#111827",
  };
}

function edgeLabel(edge) {
  return document.getElementById("edge-counts").checked ? String(edge.count) : "";
}

const nodesDS = new vis.DataSet(RAW_NODES.map(function(node) {
  return {
    id: node.id,
    label: node.label,
    title: node.title,
    x: node.x,
    y: node.y,
    fixed: { x: true, y: true },
    shape: "dot",
    size: node.size,
    color: {
      background: node.color,
      border: node.color,
      highlight: { background: "#f8fafc", border: node.color },
    },
    font: nodeFont(),
  };
}));

const edgesDS = new vis.DataSet(RAW_EDGES.map(function(edge) {
  return {
    id: edge.id,
    from: edge.from,
    to: edge.to,
    label: edgeLabel(edge),
    title: edge.title,
    width: edge.width,
    hidden: edge.hiddenByDefault,
    color: { color: "#64748b", highlight: "#f8fafc", hover: "#93c5fd", opacity: 0.5 },
    arrows: { to: { enabled: true, scaleFactor: 0.45 } },
    smooth: { type: "cubicBezier", roundness: 0.25 },
  };
}));

const network = new vis.Network(document.getElementById("graph"), { nodes: nodesDS, edges: edgesDS }, {
  physics: false,
  layout: { improvedLayout: false },
  interaction: { hover: true, tooltipDelay: 80, hideEdgesOnDrag: true },
  nodes: { borderWidth: 2 },
  edges: { selectionWidth: 3 },
});

network.once("afterDrawing", function() {
  if (document.getElementById("fit-view").checked) {
    network.fit({ animation: false });
  }
});

network.on("click", function(params) {
  if (params.nodes && params.nodes.length) {
    showNode(params.nodes[0]);
    return;
  }
  if (params.edges && params.edges.length) {
    showEdge(params.edges[0]);
    return;
  }
  nodesDS.update(RAW_NODES.map(function(node) { return { id: node.id, opacity: 1 }; }));
  edgesDS.update(RAW_EDGES.map(function(edge) { return { id: edge.id, color: { color: "#64748b", highlight: "#f8fafc", hover: "#93c5fd", opacity: 0.5 } }; }));
  document.getElementById("info-content").innerHTML = '<span class="muted">Click an aggregate node or edge to inspect counts and examples.</span>';
});

function refreshLabels() {
  nodesDS.update(RAW_NODES.map(function(node) { return { id: node.id, font: nodeFont() }; }));
}

function refreshEdgeLabels() {
  edgesDS.update(RAW_EDGES.map(function(edge) { return { id: edge.id, label: edgeLabel(edge) }; }));
}

function refreshEdgeVisibility() {
  const showWeak = document.getElementById("weak-edges").checked;
  edgesDS.update(RAW_EDGES.map(function(edge) {
    return { id: edge.id, hidden: edge.hiddenByDefault && !showWeak };
  }));
}

function showNode(nodeId) {
  const node = byId.get(nodeId);
  if (!node) return;
  const neighbors = adjacency.get(nodeId) || new Set();
  if (document.getElementById("highlight-neighbors").checked) {
    nodesDS.update(RAW_NODES.map(function(item) {
      const active = item.id === nodeId || neighbors.has(item.id);
      return { id: item.id, opacity: active ? 1 : 0.22 };
    }));
    edgesDS.update(RAW_EDGES.map(function(edge) {
      const active = edge.from === nodeId || edge.to === nodeId;
      return { id: edge.id, color: { color: active ? "#f8fafc" : "#64748b", highlight: "#f8fafc", hover: "#93c5fd", opacity: active ? 0.9 : 0.15 } };
    }));
  }
  const files = (node.topFiles || []).map(function(file) {
    return '<span class="pill">' + esc(file.file) + ' (' + file.count + ')</span>';
  }).join("");
  const communities = (node.topCommunities || []).map(function(item) {
    return '<span class="pill">' + esc(item.label) + ' (' + item.count + ')</span>';
  }).join("");
  const hubs = (node.topNodes || []).map(function(item) {
    return '<span class="pill">' + esc(item.label) + ' (' + item.degree + ')</span>';
  }).join("");
  const drilldown = node.command
    ? '<div class="field">Drilldown: <code>' + esc(node.command) + '</code></div><div class="field"><a href="' + esc("domain-" + node.id + "/graph.html") + '">Open generated drilldown if present</a></div>'
    : "";
  document.getElementById("info-content").innerHTML =
    '<div class="field"><b>' + esc(node.label) + '</b></div>' +
    (node.communityId ? '<div class="field">Community ID: ' + esc(node.communityId) + '</div>' : "") +
    '<div class="field">Group: ' + esc(node.groupLabel || node.domainLabel || "-") + '</div>' +
    '<div class="field">Symbols: ' + node.symbolCount + '</div>' +
    '<div class="field">Files: ' + node.fileCount + '</div>' +
    drilldown +
    (communities ? '<div class="field muted">Top communities</div><div class="field">' + communities + '</div>' : "") +
    (hubs ? '<div class="field muted">Top hubs</div><div class="field">' + hubs + '</div>' : "") +
    (files ? '<div class="field muted">Top files</div><div class="field">' + files + '</div>' : "");
}

function showEdge(edgeId) {
  const edge = edgeById.get(edgeId);
  if (!edge) return;
  const relations = (edge.relations || []).map(function(item) {
    return '<span class="pill">' + esc(item.relation) + ' (' + item.count + ')</span>';
  }).join("");
  const examples = (edge.examples || []).map(function(example) {
    return '<div class="field">' + esc(example.source) + ' -> ' + esc(example.target) + ' <span class="muted">' + esc(example.relation) + '</span><br><span class="muted">' + esc(example.file || "") + '</span></div>';
  }).join("");
  document.getElementById("info-content").innerHTML =
    '<div class="field"><b>' + esc(byId.get(edge.from)?.label || edge.from) + ' -> ' + esc(byId.get(edge.to)?.label || edge.to) + '</b></div>' +
    '<div class="field">Relationships: ' + edge.count + '</div>' +
    (relations ? '<div class="field muted">Relation types</div><div class="field">' + relations + '</div>' : "") +
    (examples ? '<div class="field muted">Examples</div>' + examples : "");
}

document.getElementById("show-labels").addEventListener("change", refreshLabels);
document.getElementById("edge-counts").addEventListener("change", refreshEdgeLabels);
document.getElementById("weak-edges").addEventListener("change", refreshEdgeVisibility);

const listEl = document.getElementById("node-list");
RAW_NODES.slice().sort(function(a, b) {
  return b.symbolCount - a.symbolCount || a.label.localeCompare(b.label);
}).forEach(function(node) {
  const item = document.createElement("div");
  item.className = "list-item";
  item.title = node.title;
  item.innerHTML = '<span class="dot" style="background:' + node.color + '"></span><span class="label">' + esc(node.label) + '</span><span class="count">' + node.symbolCount + '</span>';
  item.addEventListener("click", function() {
    network.focus(node.id, { scale: IS_ARCHITECTURE ? 1.05 : 1.3, animation: true });
    network.selectNodes([node.id]);
    showNode(node.id);
  });
  listEl.appendChild(item);
});
</script>
</body>
</html>
`;
}

function writeCombinedReport() {
  fs.mkdirSync(graphifyOutRoot, { recursive: true });
  const dirs = outputDirsWithGraphs();
  const sections = ["# Graphify Architecture Outputs", ""];
  for (const { slice, dir } of dirs) {
    const reportSlice = slice === "default-full" ? "full" : slice;
    postprocessOutput(dir, reportSlice, []);
  }

  const rootAnalysis = fs.existsSync(path.join(graphifyOutRoot, "graph.json"))
    ? readAnalysis(graphifyOutRoot)
    : null;
  if (rootAnalysis?.views) {
    sections.push("## default architecture overview");
    sections.push("- Path: graphify-out/architecture-overview.html");
    sections.push(`- Nodes: ${rootAnalysis.views.architecture.nodeCount}`);
    sections.push(`- Edges: ${rootAnalysis.views.architecture.edgeCount}`);
    sections.push(
      `- Default visible edges: ${rootAnalysis.views.architecture.defaultVisibleEdges}`
    );
    sections.push("- Communities: n/a; collapsed to product domains");
    sections.push(
      `- Excluded-folder hits: ${excludedFolderSummary(rootAnalysis)}`
    );
    sections.push("");

    sections.push("## community overview");
    sections.push("- Path: graphify-out/community-overview.html");
    sections.push(`- Nodes: ${rootAnalysis.views.community.nodeCount}`);
    sections.push(`- Edges: ${rootAnalysis.views.community.edgeCount}`);
    sections.push(
      `- Default visible edges: ${rootAnalysis.views.community.defaultVisibleEdges}`
    );
    sections.push(`- Communities: ${rootAnalysis.views.community.nodeCount}`);
    sections.push(
      `- Excluded-folder hits: ${excludedFolderSummary(rootAnalysis)}`
    );
    sections.push("");

    sections.push("## raw full graph");
    sections.push("- Path: graphify-out/raw-full-graph.html");
    sections.push(`- Nodes: ${rootAnalysis.views.raw.nodeCount}`);
    sections.push(`- Edges: ${rootAnalysis.views.raw.edgeCount}`);
    sections.push(`- Communities: ${rootAnalysis.communityCount}`);
    sections.push(
      "- Use: deep inspection only; not the default architecture overview"
    );
    sections.push(
      `- Excluded-folder hits: ${excludedFolderSummary(rootAnalysis)}`
    );
    sections.push("");
  }

  for (const { slice, dir } of dirs) {
    if (slice === "default-full" || slice === "full") continue;
    const analysis = readAnalysis(dir);
    sections.push(`## ${slice}`);
    sections.push(`- Path: ${toSlash(path.relative(repoRoot, dir))}`);
    sections.push(
      `- HTML: ${toSlash(path.relative(repoRoot, path.join(dir, "graph.html")))}`
    );
    sections.push(`- Nodes: ${analysis.nodeCount}`);
    sections.push(`- Edges: ${analysis.edgeCount}`);
    sections.push(`- Communities: ${analysis.communityCount}`);
    sections.push(`- Excluded-folder hits: ${excludedFolderSummary(analysis)}`);
    sections.push(
      `- Largest communities: ${analysis.largestCommunities
        .slice(0, 5)
        .map((c) => c.label)
        .join(", ")}`
    );
    sections.push("");
  }
  fs.writeFileSync(
    path.join(graphifyOutRoot, "GRAPH_AUDIT_REPORT.md"),
    sections.join("\n") + "\n"
  );
}

function excludedFolderSummary(analysis) {
  return (
    analysis.noise
      .filter((item) => item.count > 0)
      .map((item) => `${item.name}=${item.count}`)
      .join(", ") || "none"
  );
}

function readAnalysis(dir) {
  const analysisPath = path.join(dir, ".graphify_analysis.json");
  if (!fs.existsSync(analysisPath)) return null;
  return JSON.parse(fs.readFileSync(analysisPath, "utf8"));
}

function uniqueSourceFileCount(graph) {
  return new Set(
    (graph.nodes || []).map((node) => node.source_file).filter(Boolean)
  ).size;
}

function outputDirsWithGraphs() {
  const dirs = [];
  if (fs.existsSync(path.join(graphifyOutRoot, "graph.json"))) {
    dirs.push({ slice: "default-full", dir: graphifyOutRoot });
  }
  for (const slice of Object.keys(sliceConfigs)) {
    const dir = path.join(graphifyOutRoot, slice);
    if (fs.existsSync(path.join(dir, "graph.json"))) dirs.push({ slice, dir });
  }
  for (const domain of domainConfigs) {
    const slice = `domain-${domain.id}`;
    const dir = path.join(graphifyOutRoot, slice);
    if (fs.existsSync(path.join(dir, "graph.json"))) dirs.push({ slice, dir });
  }
  return dirs;
}

function outputDirForSlice(slice) {
  if (slice === "default-full") return graphifyOutRoot;
  const named = path.join(graphifyOutRoot, slice);
  if (fs.existsSync(path.join(named, "graph.json"))) return named;
  if (
    slice === "full" &&
    fs.existsSync(path.join(graphifyOutRoot, "graph.json"))
  )
    return graphifyOutRoot;
  return named;
}

function mirrorFullOutput(fullDir) {
  const files = [
    "graph.json",
    "graph.html",
    "architecture-overview.html",
    "community-overview.html",
    "raw-full-graph.html",
    "GRAPH_REPORT.md",
    "GRAPH_TREE.html",
    ".graphify_labels.json",
    ".graphify_analysis.json",
  ];
  for (const file of files) {
    const source = path.join(fullDir, file);
    if (!fs.existsSync(source)) continue;
    const destination = path.join(graphifyOutRoot, file);
    assertInside(graphifyOutRoot, destination);
    fs.copyFileSync(source, destination);
  }
  fs.writeFileSync(
    path.join(graphifyOutRoot, ".graphify_root"),
    repoRoot + "\n"
  );
}

function resolveGraphifyBin(required) {
  const candidates = [
    process.env.GRAPHIFY_BIN,
    "graphify",
    path.join(
      process.env.APPDATA || "",
      "Python",
      "Python312",
      "Scripts",
      "graphify.exe"
    ),
    path.join(
      os.homedir(),
      "AppData",
      "Roaming",
      "Python",
      "Python312",
      "Scripts",
      "graphify.exe"
    ),
    path.join(os.homedir(), ".local", "bin", "graphify"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["--version"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    if (result.status === 0) return candidate;
  }

  if (required) {
    throw new Error(
      "Graphify CLI was not found. Install graphifyy at the version in .graphify-version."
    );
  }
  return null;
}

function assertGraphifyVersion(graphifyBin) {
  if (!fs.existsSync(versionPath)) return;
  const expected = fs.readFileSync(versionPath, "utf8").trim();
  if (!expected) return;
  const result = spawnSync(graphifyBin, ["--version"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const actual = (result.stdout || result.stderr || "").match(
    /graphify\s+([^\s]+)/
  )?.[1];
  if (actual !== expected) {
    throw new Error(
      `Graphify version mismatch. Expected ${expected}, got ${actual || "unknown"}.`
    );
  }
}

function runGraphify(graphifyBin, args, options) {
  const result = spawnSync(graphifyBin, args, {
    cwd: repoRoot,
    stdio: options.quiet ? "pipe" : "inherit",
    encoding: options.quiet ? "utf8" : undefined,
    env: {
      ...process.env,
      GRAPHIFY_VIZ_NODE_LIMIT: process.env.GRAPHIFY_VIZ_NODE_LIMIT || "10000",
    },
  });
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(
      `graphify ${args.join(" ")} failed.${output ? `\n${output}` : ""}`
    );
  }
}

function copyDirectory(source, destination) {
  assertInside(graphifyOutRoot, destination);
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    assertInside(destination, destinationPath);
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, destinationPath);
    } else {
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
}

function safeRemove(target, allowedRoot) {
  if (!fs.existsSync(target)) return;
  assertInside(allowedRoot, target);
  fs.rmSync(target, { recursive: true, force: true });
}

function assertInside(parent, target) {
  const resolvedParent = path.resolve(parent);
  const resolvedTarget = path.resolve(target);
  const relative = path.relative(resolvedParent, resolvedTarget);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(
      `Refusing to operate outside ${resolvedParent}: ${resolvedTarget}`
    );
  }
}

function compareCommunityIds(a, b) {
  return Number(a[0]) - Number(b[0]);
}

function sanitizeTableCell(value) {
  return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function titleFromPath(value) {
  return String(value)
    .replace(/\.[cm]?[jt]sx?$/, "")
    .split(/[\/_\-.()[\]\s]+/)
    .filter(Boolean)
    .slice(-4)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function hashCode(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function percentile(values, p) {
  const nums = values
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (nums.length === 0) return 0;
  return nums[Math.min(nums.length - 1, Math.floor(nums.length * p))];
}

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (ch) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[ch]
  );
}

function log(options, message) {
  if (!options.quiet) console.log(message);
}

function toSlash(value) {
  return String(value).replace(/\\/g, "/");
}

main();
