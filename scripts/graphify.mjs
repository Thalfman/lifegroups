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
  node scripts/graphify.mjs tree [full|plan|multiply|care|calendar]
  node scripts/graphify.mjs report
  node scripts/graphify.mjs clean

Generated graphs are written to graphify-out/<slice>/. The full graph is also
mirrored to graphify-out/ so graphify query/explain keep their default path.`);
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
  const overrides = readCommunityOverrides();
  const previousAnalysis = readAnalysis(outDir);
  const stagedFileCount =
    stagedFiles.length > 0
      ? stagedFiles.length
      : previousAnalysis?.stagedFileCount > 0
        ? previousAnalysis.stagedFileCount
        : uniqueSourceFileCount(graph);
  const analysis = analyzeGraph(graph, slice, stagedFileCount, overrides);

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
  fs.writeFileSync(
    path.join(outDir, "graph.html"),
    renderHtml(graph.nodes || [], edges, analysis, slice)
  );
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
  lines.push("- Node labels are hidden by default except hubs.");
  lines.push(
    "- Use Show Labels, Hub Labels, Selected Community, Neighbor Labels, and Zoom Labels in graph.html."
  );
  lines.push(
    "- Edge labels are hidden by default. Select an edge or enable Edge Labels to inspect relationship types."
  );
  return lines.join("\n");
}

function renderHtml(nodes, edges, analysis, slice) {
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

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>lifegroups ${escapeHtml(slice)} architecture graph</title>
<script src="https://unpkg.com/vis-network@9.1.6/standalone/umd/vis-network.min.js"></script>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; height: 100vh; display: flex; overflow: hidden; background: #101319; color: #e5e7eb; font-family: Arial, sans-serif; }
  #graph { flex: 1; min-width: 0; }
  #sidebar { width: 360px; background: #171b24; border-left: 1px solid #303746; display: flex; flex-direction: column; }
  #top { padding: 14px; border-bottom: 1px solid #303746; }
  #top h1 { margin: 0 0 8px; font-size: 15px; font-weight: 700; }
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
    <h1>${escapeHtml(sliceConfigs[slice]?.label || slice)} Graph</h1>
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

function writeCombinedReport() {
  fs.mkdirSync(graphifyOutRoot, { recursive: true });
  const dirs = outputDirsWithGraphs();
  const sections = ["# Graphify Architecture Outputs", ""];
  for (const { slice, dir } of dirs) {
    const reportSlice = slice === "default-full" ? "full" : slice;
    postprocessOutput(dir, reportSlice, []);
    const analysis = readAnalysis(dir);
    sections.push(`## ${slice}`);
    sections.push(`- Path: ${toSlash(path.relative(repoRoot, dir))}`);
    sections.push(`- Nodes: ${analysis.nodeCount}`);
    sections.push(`- Edges: ${analysis.edgeCount}`);
    sections.push(`- Communities: ${analysis.communityCount}`);
    sections.push(
      `- Excluded-folder hits: ${
        analysis.noise
          .filter((item) => item.count > 0)
          .map((item) => `${item.name}=${item.count}`)
          .join(", ") || "none"
      }`
    );
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
