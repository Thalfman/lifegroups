#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG_PATH = path.join(ROOT, "graphify", "scopes.json");
const LABELS_PATH = path.join(ROOT, "graphify", "community-labels.json");
const config = readJson(CONFIG_PATH);
const labelConfig = readJson(LABELS_PATH);
const categoryConfig = buildCategoryConfig(labelConfig);
const outputRoot = path.join(ROOT, config.outputRoot);
const stageRoot = path.join(ROOT, config.stageRoot);
const command = process.argv[2] || "product";
let graphifyExe;
let gitExe;

process.chdir(ROOT);

if (command === "features") {
  for (const scopeName of config.featureOrder) {
    runScope(scopeName);
  }
} else if (command === "overview") {
  writeOverview();
} else if (command === "tree") {
  writeTree();
} else if (command === "health") {
  runHealth();
} else if (command === "list") {
  console.log(Object.keys(config.scopes).join("\n"));
} else if (config.scopes[command]) {
  runScope(command);
} else {
  fail(`Unknown graphify command: ${command}`);
}

function runScope(scopeName) {
  const scope = config.scopes[scopeName];
  const selected = selectScopeFiles(scope);
  if (selected.files.length === 0) {
    fail(`Scope "${scopeName}" selected zero files`);
  }

  const stageDir = path.join(stageRoot, scopeName);
  const generatedDir = path.join(stageDir, "graphify-out");
  const destDir = path.join(outputRoot, scope.output);

  console.log(
    `[graphify] ${scope.title}: staging ${selected.files.length} tracked files`
  );
  resetDirectory(stageDir, stageRoot);
  for (const file of selected.files) {
    const source = path.join(ROOT, file);
    const target = path.join(stageDir, file);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileWithRetry(source, target);
  }

  runGraphify(["extract", stageDir, "--out", stageDir, "--max-workers", "1"], {
    GRAPHIFY_VIZ_NODE_LIMIT: "10000",
  });

  runGraphify(
    [
      "cluster-only",
      stageDir,
      "--graph",
      path.join(generatedDir, "graph.json"),
      "--no-label",
    ],
    { GRAPHIFY_VIZ_NODE_LIMIT: "10000" }
  );

  if (scope.cleanGraph) {
    writeCleanGraphOutputs(
      generatedDir,
      buildCleanGraph(
        readJson(path.join(generatedDir, "graph.json")),
        scope,
        selected
      )
    );
  } else {
    runGraphify(
      [
        "tree",
        "--graph",
        path.join(generatedDir, "graph.json"),
        "--output",
        path.join(generatedDir, "GRAPH_TREE.html"),
        "--root",
        stageDir,
        "--label",
        `LifeGroups ${scope.title}`,
      ],
      {}
    );
  }

  copyDurableOutputs(generatedDir, destDir, scopeName, scope);
  const graph = readJson(path.join(destDir, "graph.json"));
  if (scope.cleanGraph) {
    writeCleanGraphLabels(destDir, graph);
  } else {
    const labels = inferCommunityLabels(analyzeGraph(graph));
    applyCommunityLabels(destDir, labels);
  }
  const report = scope.cleanGraph
    ? buildCleanScopeReport(scopeName, scope, graph, selected)
    : buildScopeReport(scopeName, scope, graph, selected);
  writeTextFile(path.join(destDir, scope.report), report);
  console.log(
    `[graphify] ${scope.title}: wrote ${path.relative(ROOT, destDir)}`
  );
}

function selectScopeFiles(scope) {
  const trackedFiles = gitLsFiles();
  const include = mergeMatchers(
    scope.include,
    scope.includeBoundarySet ? { files: config.baseBoundaryFiles } : {}
  );
  const excluded = new Map();
  const files = [];

  for (const file of trackedFiles) {
    if (!matchesMatcher(file, include)) continue;
    const exclusion = firstMatchingRule(file, [
      ...config.baseExclude,
      ...(scope.exclude || []),
    ]);
    if (exclusion) {
      excluded.set(exclusion.label, (excluded.get(exclusion.label) || 0) + 1);
      continue;
    }
    files.push(file);
  }

  files.sort();
  return { files, excluded };
}

function gitLsFiles() {
  const result = spawnSync(getGit(), ["ls-files", "-z"], {
    cwd: ROOT,
    encoding: "buffer",
  });
  if (result.status !== 0) {
    fail(
      `git ls-files failed: ${result.error || result.stderr?.toString("utf8") || "unknown error"}`
    );
  }
  return result.stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map(normalizePath);
}

function getGit() {
  if (gitExe) return gitExe;
  const candidates = [
    path.join(
      process.env.ProgramFiles || "C:\\Program Files",
      "Git",
      "cmd",
      "git.exe"
    ),
    path.join(
      process.env.ProgramFiles || "C:\\Program Files",
      "Git",
      "bin",
      "git.exe"
    ),
    "git",
  ];

  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["--version"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    if (result.status === 0) {
      gitExe = candidate;
      return gitExe;
    }
  }

  fail("Unable to run git.");
}

function buildCategoryConfig(labels) {
  const fallbackCategories = [
    { id: "route_page_layout", label: "Route/Page/Layout", color: "#4E79A7" },
    { id: "server_action", label: "Server Action", color: "#F28E2B" },
    { id: "feature_component", label: "Feature Component", color: "#59A14F" },
    { id: "domain_module", label: "Domain Module", color: "#B07AA1" },
    {
      id: "supabase_read_adapter",
      label: "Supabase Read Adapter",
      color: "#76B7B2",
    },
    { id: "rpc_write_boundary", label: "RPC/Write Boundary", color: "#E15759" },
    {
      id: "auth_session_boundary",
      label: "Auth/Session Boundary",
      color: "#EDC948",
    },
    { id: "shared_plumbing", label: "Shared Plumbing", color: "#BAB0AC" },
    {
      id: "shared_ui_primitive",
      label: "Shared UI Primitive",
      color: "#9C755F",
    },
    { id: "validation", label: "Validation", color: "#FF9DA7" },
    {
      id: "observability_security",
      label: "Observability/Security",
      color: "#8CD17D",
    },
    { id: "type_vocabulary", label: "Type/Vocabulary", color: "#86BCB6" },
  ];

  const categories = (
    labels.categories?.length ? labels.categories : fallbackCategories
  ).map((category, index) => ({
    ...category,
    community: index,
  }));

  return {
    categories,
    byId: new Map(categories.map((category) => [category.id, category])),
    featureLabels: labels.features || {
      auth: "Auth",
      calendar: "Calendar",
      care: "Care",
      core: "Core",
      groups: "Groups",
      home: "Home",
      multiply: "Multiply",
      people: "People",
      plan: "Plan",
      settings: "Settings",
      shared: "Shared",
    },
  };
}

function buildCleanGraph(rawGraph, scope, selected) {
  const cleanConfig = config.cleanGraph || {};
  const rawNodes = rawGraph.nodes || [];
  const rawLinks = rawGraph.links || rawGraph.edges || [];
  const nodeById = new Map(rawNodes.map((node) => [node.id, node]));
  const fileStats = new Map();
  const fileLinks = [];

  for (const node of rawNodes) {
    const file = normalizeMaybe(node.source_file);
    if (!file) continue;
    const stats = ensureFileStats(fileStats, file);
    stats.symbolCount += 1;
    if (node.community !== undefined) {
      stats.rawCommunities.set(
        String(node.community),
        (stats.rawCommunities.get(String(node.community)) || 0) + 1
      );
    }
  }

  for (const link of rawLinks) {
    const sourceFile = normalizeMaybe(
      nodeById.get(link.source)?.source_file || link.source_file
    );
    const targetFile = normalizeMaybe(nodeById.get(link.target)?.source_file);
    if (!sourceFile || !targetFile || sourceFile === targetFile) continue;

    const weight = cleanWeight(link.weight);
    const sourceStats = ensureFileStats(fileStats, sourceFile);
    const targetStats = ensureFileStats(fileStats, targetFile);
    sourceStats.outboundWeight += weight;
    sourceStats.degreeWeight += weight;
    sourceStats.outboundCount += 1;
    sourceStats.degreeCount += 1;
    targetStats.inboundWeight += weight;
    targetStats.degreeWeight += weight;
    targetStats.inboundCount += 1;
    targetStats.degreeCount += 1;

    fileLinks.push({
      sourceFile,
      targetFile,
      weight,
      relation: link.relation || "edge",
      sourceLocation: link.source_location || "",
    });
  }

  const statsList = [...fileStats.values()]
    .map((stats) => ({ ...stats, ...classifyCleanFile(stats.file) }))
    .sort(
      (a, b) => b.degreeWeight - a.degreeWeight || a.file.localeCompare(b.file)
    );
  const preserve = chooseCleanPreservedFiles(statsList, cleanConfig);
  const grouped = groupCleanFiles(statsList, preserve);
  const fileToGroupId = new Map();

  for (const group of grouped.values()) {
    for (const file of group.files) {
      fileToGroupId.set(file, group.id);
    }
  }

  const edgeMap = new Map();
  for (const link of fileLinks) {
    const source = fileToGroupId.get(link.sourceFile);
    const target = fileToGroupId.get(link.targetFile);
    if (!source || !target || source === target) continue;

    const sourceNode = grouped.get(source);
    const targetNode = grouped.get(target);
    const key = `${source}\u0000${target}`;
    if (!edgeMap.has(key)) {
      edgeMap.set(key, {
        source,
        target,
        weight: 0,
        rawEdgeCount: 0,
        relationCounts: new Map(),
        softened:
          isSoftenedCleanCategory(sourceNode.category) ||
          isSoftenedCleanCategory(targetNode.category),
        examples: [],
      });
    }

    const edge = edgeMap.get(key);
    edge.weight += link.weight;
    edge.rawEdgeCount += 1;
    edge.relationCounts.set(
      link.relation,
      (edge.relationCounts.get(link.relation) || 0) + 1
    );
    const example = `${link.sourceFile} -> ${link.targetFile}`;
    if (edge.examples.length < 5 && !edge.examples.includes(example))
      edge.examples.push(example);
  }

  const softFactor = Number(cleanConfig.softenedEdgeWeight || 0.35);
  const links = [...edgeMap.values()]
    .map((edge) => ({
      source: edge.source,
      target: edge.target,
      weight: roundWeight(edge.weight),
      visual_weight: roundWeight(
        edge.softened ? Math.max(1, edge.weight * softFactor) : edge.weight
      ),
      softened: edge.softened,
      relation: topMapEntry(edge.relationCounts)?.[0] || "edge",
      relation_counts: Object.fromEntries(
        [...edge.relationCounts.entries()].sort(
          (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
        )
      ),
      raw_edge_count: edge.rawEdgeCount,
      examples: edge.examples,
    }))
    .sort(
      (a, b) =>
        a.source.localeCompare(b.source) || a.target.localeCompare(b.target)
    );

  const degreeByNode = new Map();
  for (const link of links) {
    degreeByNode.set(
      link.source,
      (degreeByNode.get(link.source) || 0) + link.visual_weight
    );
    degreeByNode.set(
      link.target,
      (degreeByNode.get(link.target) || 0) + link.visual_weight
    );
  }

  const nodes = [...grouped.values()]
    .map((node) => finalizeCleanNode(node, degreeByNode.get(node.id) || 0))
    .sort(
      (a, b) =>
        a.community - b.community ||
        a.feature.localeCompare(b.feature) ||
        b.degree - a.degree ||
        a.label.localeCompare(b.label) ||
        a.id.localeCompare(b.id)
    );

  return {
    directed: true,
    multigraph: false,
    graph: {
      name: `LifeGroups ${scope.title} Clean File/Module Graph`,
      kind: "clean-file-module",
      raw_node_count: rawNodes.length,
      raw_edge_count: rawLinks.length,
      raw_source_file_count: fileStats.size,
      selected_file_count: selected.files.length,
      preserved_file_node_count: [...grouped.values()].filter(
        (node) => !node.grouped
      ).length,
      grouped_bucket_count: [...grouped.values()].filter((node) => node.grouped)
        .length,
      grouped_file_count: [...grouped.values()]
        .filter((node) => node.grouped)
        .reduce((count, node) => count + node.files.length, 0),
      target_min_nodes: cleanConfig.targetMinNodes || 80,
      target_max_nodes: cleanConfig.targetMaxNodes || 200,
      generated_at: new Date().toISOString(),
    },
    nodes,
    links,
    built_at_commit: rawGraph.built_at_commit,
  };
}

function ensureFileStats(fileStats, file) {
  if (!fileStats.has(file)) {
    fileStats.set(file, {
      file,
      symbolCount: 0,
      inboundWeight: 0,
      outboundWeight: 0,
      degreeWeight: 0,
      inboundCount: 0,
      outboundCount: 0,
      degreeCount: 0,
      rawCommunities: new Map(),
    });
  }
  return fileStats.get(file);
}

function chooseCleanPreservedFiles(statsList, cleanConfig) {
  const targetMax = cleanConfig.targetMaxNodes || 200;
  const requestedTop = cleanConfig.preserveTopFiles || 120;
  const minimumTop = cleanConfig.minimumPreserveTopFiles || 60;
  const boundaryFiles = new Set([
    ...(config.baseBoundaryFiles || []),
    ...(cleanConfig.preserveFiles || []),
  ]);
  let best = null;

  for (let top = requestedTop; top >= minimumTop; top -= 10) {
    const preserve = new Set(
      statsList.slice(0, top).map((stats) => stats.file)
    );
    for (const file of boundaryFiles) {
      if (statsList.some((stats) => stats.file === file)) preserve.add(file);
    }

    const totalNodes =
      preserve.size +
      new Set(
        statsList
          .filter((stats) => !preserve.has(stats.file))
          .map(bucketKeyForCleanFile)
      ).size;
    best = { preserve, totalNodes };
    if (totalNodes <= targetMax) return preserve;
  }

  return best?.preserve || new Set();
}

function groupCleanFiles(statsList, preserve) {
  const groups = new Map();

  for (const stats of statsList) {
    const groupKey = preserve.has(stats.file)
      ? `file:${stats.file}`
      : `bucket:${bucketKeyForCleanFile(stats)}`;
    const grouped = !preserve.has(stats.file);
    const id = stableNodeId(grouped ? "bucket" : "file", groupKey);

    if (!groups.has(id)) {
      const category = categoryForId(stats.category);
      groups.set(id, {
        id,
        grouped,
        key: groupKey,
        label: grouped
          ? bucketLabelForCleanFile(stats)
          : cleanFileLabel(stats.file),
        title: grouped ? bucketTitleForCleanFile(stats) : stats.file,
        source_file: grouped ? bucketSourceForCleanFile(stats) : stats.file,
        source_files: [],
        files: [],
        file_count: 0,
        symbol_count: 0,
        raw_inbound_weight: 0,
        raw_outbound_weight: 0,
        category: stats.category,
        category_label: category.label,
        community: category.community,
        community_name: category.label,
        feature: stats.feature,
        feature_label: featureLabel(stats.feature),
        color: category.color,
        file_type: grouped ? "module-bucket" : "code",
      });
    }

    const group = groups.get(id);
    group.files.push(stats.file);
    group.source_files.push(stats.file);
    group.file_count += 1;
    group.symbol_count += stats.symbolCount;
    group.raw_inbound_weight += stats.inboundWeight;
    group.raw_outbound_weight += stats.outboundWeight;
  }

  return groups;
}

function finalizeCleanNode(node, degree) {
  const fileBonus = Math.log2(node.file_count + 1);
  const size = Math.max(
    12,
    Math.min(38, 12 + Math.sqrt(degree) * 1.55 + fileBonus)
  );
  return {
    id: node.id,
    label: node.label,
    title: cleanNodeTitle(node),
    source_file: node.source_file,
    source_files: node.source_files.sort(),
    file_count: node.file_count,
    symbol_count: node.symbol_count,
    grouped: node.grouped,
    category: node.category,
    category_label: node.category_label,
    community: node.community,
    community_name: node.community_name,
    feature: node.feature,
    feature_label: node.feature_label,
    color: node.color,
    file_type: node.file_type,
    raw_inbound_weight: roundWeight(node.raw_inbound_weight),
    raw_outbound_weight: roundWeight(node.raw_outbound_weight),
    degree: roundWeight(degree),
    size: roundWeight(size),
  };
}

function classifyCleanFile(file) {
  const lower = file.toLowerCase();
  let category = "domain_module";

  if (
    lower === "middleware.ts" ||
    lower.startsWith("lib/auth/") ||
    /^app\/(auth|login|invite|forgot-password|reset-password|welcome|unauthorized)\//.test(
      lower
    )
  ) {
    category = "auth_session_boundary";
  } else if (/^app\/.*\/(actions|[a-z0-9-]+-actions|route)\.ts$/.test(lower)) {
    category = "server_action";
  } else if (/^app\/.*\/(page|layout)\.tsx?$/.test(lower)) {
    category = "route_page_layout";
  } else if (
    /(^|\/)(rpc|run-action)\.ts$/.test(lower) ||
    lower.includes("/rpc/")
  ) {
    category = "rpc_write_boundary";
  } else if (
    lower.startsWith("lib/supabase/") &&
    /(read|reads|read-model|batch|config|cached-config|server)/.test(lower)
  ) {
    category = "supabase_read_adapter";
  } else if (
    lower.startsWith("lib/admin/validation/") ||
    lower.startsWith("lib/leader/validation")
  ) {
    category = "validation";
  } else if (
    lower.startsWith("components/ui/") ||
    lower.startsWith("components/lg/") ||
    lower.startsWith("components/pastoral/") ||
    lower.startsWith("components/auth/") ||
    lower.startsWith("components/sign-in/")
  ) {
    category = "shared_ui_primitive";
  } else if (lower.startsWith("components/")) {
    category = "feature_component";
  } else if (
    lower.startsWith("lib/observability/") ||
    lower.startsWith("lib/security/") ||
    lower.startsWith("lib/crypto/")
  ) {
    category = "observability_security";
  } else if (
    lower.startsWith("lib/shared/") ||
    lower.startsWith("lib/forms/") ||
    lower.startsWith("lib/hooks/") ||
    lower === "lib/utils.ts"
  ) {
    category = "shared_plumbing";
  } else if (lower.startsWith("types/")) {
    category = "type_vocabulary";
  }

  return { category, feature: featureForCleanFile(file, category) };
}

function featureForCleanFile(file, category) {
  const tagged = featureTag(file);
  if (tagged) return tagged;
  const lower = file.toLowerCase();
  if (
    category === "auth_session_boundary" ||
    /auth|login|session|middleware|password|invite|welcome|unauthorized/.test(
      lower
    )
  )
    return "auth";
  if (isSoftenedCleanCategory(category) || category === "type_vocabulary")
    return "shared";
  return "core";
}

function bucketKeyForCleanFile(stats) {
  return `${stats.feature}:${stats.category}`;
}

function bucketLabelForCleanFile(stats) {
  return `${featureLabel(stats.feature)} ${categoryForId(stats.category).label}`;
}

function bucketTitleForCleanFile(stats) {
  return `${featureLabel(stats.feature)} ${categoryForId(stats.category).label} bucket`;
}

function bucketSourceForCleanFile(stats) {
  return `module/${stats.feature}/${stats.category}`;
}

function cleanFileLabel(file) {
  const parts = file.split("/");
  const filename = parts.at(-1) || file;
  const stem = filename.replace(/\.[cm]?[tj]sx?$/i, "");

  if (parts[0] === "app") {
    const routeParts = parts
      .slice(1, -1)
      .filter((part) => !part.startsWith("(") && !part.startsWith("["))
      .map(humanizePathPart);
    const routeName = titleCase(routeParts.slice(-3).join(" "));
    return routeName
      ? `${routeName} ${routeFileKind(stem)}`
      : `App ${routeFileKind(stem)}`;
  }

  if (parts[0] === "components") {
    return (
      titleCase(parts.slice(1).map(humanizePathPart).slice(-3).join(" ")) ||
      filename
    );
  }

  if (parts[0] === "lib") {
    return (
      titleCase(parts.slice(1).map(humanizePathPart).slice(-3).join(" ")) ||
      filename
    );
  }

  return labelFromPath(file);
}

function cleanNodeTitle(node) {
  const lines = [
    node.title,
    `${node.category_label} / ${node.feature_label}`,
    `${node.file_count} file${node.file_count === 1 ? "" : "s"}, ${node.symbol_count} symbols`,
  ];
  if (node.grouped) lines.push(...node.source_files.slice(0, 12));
  if (node.grouped && node.source_files.length > 12)
    lines.push(`...${node.source_files.length - 12} more`);
  return lines.join("\n");
}

function categoryForId(id) {
  return categoryConfig.byId.get(id) || categoryConfig.categories[0];
}

function featureLabel(feature) {
  return categoryConfig.featureLabels[feature] || titleCase(feature);
}

function isSoftenedCleanCategory(category) {
  return ["shared_plumbing", "shared_ui_primitive", "type_vocabulary"].includes(
    category
  );
}

function cleanWeight(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function roundWeight(value) {
  return Math.round(Number(value) * 100) / 100;
}

function topMapEntry(map) {
  return [...map.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  )[0];
}

function stableNodeId(prefix, value) {
  const slug = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 72);
  return `${prefix}_${slug || "node"}_${stableHash(value)}`;
}

function stableHash(value) {
  let hash = 5381;
  for (const char of String(value)) {
    hash = (hash * 33) ^ char.charCodeAt(0);
  }
  return (hash >>> 0).toString(36).slice(0, 6);
}

function writeCleanGraphOutputs(generatedDir, graph) {
  writeTextFile(
    path.join(generatedDir, "graph.json"),
    `${JSON.stringify(graph, null, 2)}\n`
  );
  writeTextFile(
    path.join(generatedDir, "graph.html"),
    buildCleanGraphHtml(graph)
  );
  writeTextFile(
    path.join(generatedDir, "GRAPH_REPORT.md"),
    buildCleanGraphReport(graph)
  );
  writeTextFile(
    path.join(generatedDir, "GRAPH_TREE.html"),
    buildCleanTreeHtml(graph)
  );
}

function writeCleanGraphLabels(destDir, graph) {
  const used = new Set(graph.nodes.map((node) => String(node.community)));
  const labels = Object.fromEntries(
    categoryConfig.categories
      .filter((category) => used.has(String(category.community)))
      .map((category) => [String(category.community), category.label])
  );
  writeTextFile(
    path.join(destDir, ".graphify_labels.json"),
    `${JSON.stringify(labels, null, 2)}\n`
  );
}

function buildCleanGraphReport(graph) {
  const meta = graph.graph || {};
  const categoryCounts = countBy(graph.nodes, (node) => node.category_label);
  const featureCounts = countBy(graph.nodes, (node) => node.feature_label);
  const topHubs = graph.nodes
    .slice()
    .sort((a, b) => b.degree - a.degree || a.label.localeCompare(b.label))
    .slice(0, 24);
  const topLinks = graph.links
    .slice()
    .sort((a, b) => b.weight - a.weight || a.source.localeCompare(b.source))
    .slice(0, 20);
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));

  return [
    `# Graph Report - ${meta.name || "LifeGroups Product Surface"} (${new Date().toISOString().slice(0, 10)})`,
    "",
    "## Summary",
    `- Clean graph: ${graph.nodes.length} nodes · ${graph.links.length} edges`,
    `- Raw extraction collapsed: ${meta.raw_node_count} symbol nodes · ${meta.raw_edge_count} symbol edges · ${meta.raw_source_file_count} source files`,
    `- File nodes preserved: ${meta.preserved_file_node_count}`,
    `- Module buckets: ${meta.grouped_bucket_count} buckets containing ${meta.grouped_file_count} lower-degree files`,
    "- Self-edges removed after collapse.",
    "- Shared plumbing, shared UI primitive, and type/vocabulary edges are visually softened.",
    "",
    "## Categories",
    ...formatCountMap(categoryCounts),
    "",
    "## Product Areas",
    ...formatCountMap(featureCounts),
    "",
    "## Top Hubs",
    ...topHubs.map(
      (node) =>
        `- ${node.label} (${node.degree}) - ${node.category_label}, ${node.feature_label}`
    ),
    "",
    "## Top Weighted Links",
    ...topLinks.map((link) => {
      const source = nodeById.get(link.source);
      const target = nodeById.get(link.target);
      const softened = link.softened ? ", softened" : "";
      return `- ${source?.label || link.source} -> ${target?.label || link.target}: ${link.weight} symbol links${softened}`;
    }),
    "",
  ].join("\n");
}

function buildCleanScopeReport(scopeName, scope, graph, selected) {
  const meta = graph.graph || {};
  const audit = buildNoiseAudit(selected.files, scopeName);
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const categoryCounts = countBy(graph.nodes, (node) => node.category_label);
  const featureCounts = countBy(graph.nodes, (node) => node.feature_label);
  const productHubs = graph.nodes
    .filter(
      (node) =>
        !isSoftenedCleanCategory(node.category) &&
        ![
          "auth_session_boundary",
          "rpc_write_boundary",
          "supabase_read_adapter",
        ].includes(node.category)
    )
    .sort((a, b) => b.degree - a.degree || a.label.localeCompare(b.label))
    .slice(0, 18);
  const boundaryHubs = graph.nodes
    .filter((node) =>
      [
        "server_action",
        "auth_session_boundary",
        "rpc_write_boundary",
        "supabase_read_adapter",
      ].includes(node.category)
    )
    .sort((a, b) => b.degree - a.degree || a.label.localeCompare(b.label))
    .slice(0, 18);
  const sharedHubs = graph.nodes
    .filter(
      (node) =>
        isSoftenedCleanCategory(node.category) ||
        node.category === "shared_plumbing"
    )
    .sort((a, b) => b.degree - a.degree || a.label.localeCompare(b.label))
    .slice(0, 18);
  const coupling = cleanCrossFeatureCoupling(graph, nodeById).slice(0, 12);
  const buckets = graph.nodes
    .filter((node) => node.grouped)
    .sort(
      (a, b) =>
        b.file_count - a.file_count ||
        b.degree - a.degree ||
        a.label.localeCompare(b.label)
    )
    .slice(0, 24);

  return [
    `# ${scope.title} Graph Report`,
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    `- Scope: ${scopeName}`,
    `- Staged files: ${selected.files.length}`,
    `- Raw extraction: ${meta.raw_node_count} symbol nodes, ${meta.raw_edge_count} symbol edges, ${meta.raw_source_file_count} source files`,
    `- Clean graph: ${graph.nodes.length} nodes, ${graph.links.length} edges`,
    `- Preserved file nodes: ${meta.preserved_file_node_count}`,
    `- Grouped lower-degree files: ${meta.grouped_file_count} files into ${meta.grouped_bucket_count} module buckets`,
    `- Output: ${path.posix.join("graphify-out", scope.output === "." ? "" : scope.output) || "graphify-out"}`,
    "",
    "## Exclusion Audit",
    ...audit.map((item) => `- ${item.status}: ${item.label}: ${item.count}`),
    "",
    "## Excluded Candidate Files",
    ...formatCounts(selected.excluded),
    "",
    "## Category Counts",
    ...formatCountMap(categoryCounts),
    "",
    "## Product Area Counts",
    ...formatCountMap(featureCounts),
    "",
    "## Product Hubs",
    ...formatCleanNodes(productHubs),
    "",
    "## Boundary Hubs",
    ...formatCleanNodes(boundaryHubs),
    "",
    "## Softened Shared Hubs",
    ...formatCleanNodes(sharedHubs),
    "",
    "## Cross-Feature Coupling",
    ...formatCleanCoupling(coupling),
    "",
    "## Grouped Module Buckets",
    ...buckets.map(
      (node) =>
        `- ${node.label}: ${node.file_count} files, ${node.symbol_count} symbols, degree ${node.degree}`
    ),
    "",
  ].join("\n");
}

function cleanCrossFeatureCoupling(graph, nodeById) {
  const pairs = new Map();
  for (const link of graph.links) {
    const source = nodeById.get(link.source);
    const target = nodeById.get(link.target);
    if (!source || !target) continue;
    if (source.feature === target.feature) continue;
    if (
      isSoftenedCleanCategory(source.category) ||
      isSoftenedCleanCategory(target.category)
    )
      continue;

    const key = [source.feature_label, target.feature_label]
      .sort()
      .join(" <-> ");
    if (!pairs.has(key)) pairs.set(key, { pair: key, weight: 0, examples: [] });
    const entry = pairs.get(key);
    entry.weight += link.weight;
    const example = `${source.label} -> ${target.label} (${link.weight})`;
    if (entry.examples.length < 5 && !entry.examples.includes(example))
      entry.examples.push(example);
  }

  return [...pairs.values()].sort(
    (a, b) => b.weight - a.weight || a.pair.localeCompare(b.pair)
  );
}

function formatCleanNodes(nodes) {
  if (nodes.length === 0) return ["- None found."];
  return nodes.map(
    (node) =>
      `- ${node.label} (${node.degree}) - ${node.category_label}, ${node.feature_label}`
  );
}

function formatCleanCoupling(coupling) {
  if (coupling.length === 0)
    return ["- None found after subtracting softened shared nodes."];
  return coupling.flatMap((entry) => [
    `- ${entry.pair}: ${roundWeight(entry.weight)} symbol links`,
    ...entry.examples.map((example) => `  - ${example}`),
  ]);
}

function countBy(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function formatCountMap(counts) {
  if (counts.size === 0) return ["- None."];
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label, count]) => `- ${label}: ${count}`);
}

function buildCleanGraphHtml(graph) {
  const nodes = graph.nodes.map((node) => ({
    id: node.id,
    label: node.label,
    group: node.category,
    title: node.title,
    value: Math.max(1, node.size),
    color: {
      background: node.color,
      border: node.color,
      highlight: { background: "#ffffff", border: node.color },
    },
    font: { color: "#f8fafc", size: node.grouped ? 14 : 12 },
    shape: node.grouped ? "box" : "dot",
    categoryLabel: node.category_label,
    featureLabel: node.feature_label,
    sourceFile: node.source_file,
    fileCount: node.file_count,
    symbolCount: node.symbol_count,
    degree: node.degree,
  }));
  const edges = graph.links.map((link) => ({
    id: `${link.source}->${link.target}`,
    from: link.source,
    to: link.target,
    value: Math.max(1, link.visual_weight),
    width: Math.max(1, Math.min(8, Math.sqrt(link.visual_weight))),
    arrows: { to: { enabled: true, scaleFactor: 0.45 } },
    color: link.softened
      ? {
          color: "rgba(148, 163, 184, 0.26)",
          highlight: "rgba(148, 163, 184, 0.7)",
        }
      : { color: "rgba(203, 213, 225, 0.48)", highlight: "#ffffff" },
    title: `${link.weight} symbol links${link.softened ? " (softened)" : ""}`,
    softened: link.softened,
  }));
  const legend = categoryConfig.categories
    .filter((category) =>
      graph.nodes.some((node) => node.category === category.id)
    )
    .map((category) => ({
      id: category.id,
      label: category.label,
      color: category.color,
      count: graph.nodes.filter((node) => node.category === category.id).length,
    }));

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>LifeGroups Product Surface Graph</title>
  <script src="https://unpkg.com/vis-network@9.1.6/standalone/umd/vis-network.min.js"
    integrity="sha384-Ux6phic9PEHJ38YtrijhkzyJ8yQlH8i/+buBR8s3mAZOJrP1gwyvAcIYl3GWtpX1"
    crossorigin="anonymous"></script>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; height: 100vh; overflow: hidden; display: grid; grid-template-columns: 1fr 330px; background: #101828; color: #e5e7eb; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    #graph { min-width: 0; height: 100vh; border-right: 1px solid rgba(148, 163, 184, 0.22); }
    #sidebar { min-width: 0; height: 100vh; display: flex; flex-direction: column; background: #111827; }
    header { padding: 14px 16px; border-bottom: 1px solid rgba(148, 163, 184, 0.22); }
    h1 { margin: 0; font-size: 15px; font-weight: 650; }
    .stats { margin-top: 6px; color: #9ca3af; font-size: 12px; }
    #search { width: 100%; margin-top: 12px; border: 1px solid #374151; border-radius: 6px; background: #0f172a; color: #f8fafc; padding: 8px 10px; font-size: 13px; }
    #search-results { max-height: 180px; overflow: auto; display: none; border-bottom: 1px solid rgba(148, 163, 184, 0.22); padding: 8px; }
    .search-item { padding: 6px 8px; border-radius: 5px; cursor: pointer; color: #d1d5db; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .search-item:hover { background: #1f2937; color: #ffffff; }
    #details { padding: 14px 16px; border-bottom: 1px solid rgba(148, 163, 184, 0.22); min-height: 170px; font-size: 12px; line-height: 1.45; color: #cbd5e1; }
    #details h2 { margin: 0 0 8px; color: #f8fafc; font-size: 14px; }
    #details .muted { color: #94a3b8; }
    #legend { padding: 14px 16px; overflow: auto; flex: 1; }
    #legend h2 { margin: 0 0 10px; color: #f8fafc; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; }
    .legend-row { display: grid; grid-template-columns: 18px 1fr auto; gap: 8px; align-items: center; padding: 5px 0; font-size: 12px; color: #d1d5db; }
    .legend-row input { width: 14px; height: 14px; margin: 0; }
    .dot { width: 11px; height: 11px; border-radius: 999px; display: inline-block; margin-right: 6px; vertical-align: -1px; }
    .count { color: #94a3b8; }
    #fallback { display: none; padding: 24px; color: #f8fafc; }
    @media (max-width: 820px) { body { grid-template-columns: 1fr; grid-template-rows: minmax(420px, 1fr) auto; overflow: auto; } #graph { height: 58vh; border-right: 0; border-bottom: 1px solid rgba(148, 163, 184, 0.22); } #sidebar { height: auto; max-height: none; } }
  </style>
</head>
<body>
  <div id="graph"><div id="fallback">Graph renderer unavailable. Open graph.json for the clean file/module graph data.</div></div>
  <aside id="sidebar">
    <header>
      <h1>LifeGroups Product Surface</h1>
      <div class="stats">${graph.nodes.length} nodes · ${graph.links.length} edges · collapsed from ${graph.graph.raw_node_count} symbols</div>
      <input id="search" type="search" placeholder="Search files and modules" autocomplete="off">
    </header>
    <div id="search-results"></div>
    <section id="details"><span class="muted">Click a node to inspect it.</span></section>
    <section id="legend"><h2>Categories</h2></section>
  </aside>
  <script>
    const NODES = ${jsonForHtml(nodes)};
    const EDGES = ${jsonForHtml(edges)};
    const LEGEND = ${jsonForHtml(legend)};
    const graphEl = document.getElementById("graph");
    const fallbackEl = document.getElementById("fallback");
    const detailsEl = document.getElementById("details");
    const searchEl = document.getElementById("search");
    const searchResultsEl = document.getElementById("search-results");
    const legendEl = document.getElementById("legend");

    if (!window.vis) {
      fallbackEl.style.display = "block";
    } else {
      const nodes = new vis.DataSet(NODES);
      const edges = new vis.DataSet(EDGES);
      const network = new vis.Network(graphEl, { nodes, edges }, {
        layout: { improvedLayout: true, randomSeed: 42 },
        physics: { stabilization: { iterations: 180 }, barnesHut: { gravitationalConstant: -54000, springLength: 135, springConstant: 0.035, damping: 0.18 } },
        interaction: { hover: true, navigationButtons: true, keyboard: true },
        nodes: { borderWidth: 1.5, scaling: { min: 12, max: 38 } },
        edges: { smooth: { type: "dynamic" }, selectionWidth: 2 },
      });

      const selectedCategories = new Set(LEGEND.map((item) => item.id));
      renderLegend();

      network.on("selectNode", (event) => {
        const node = nodes.get(event.nodes[0]);
        renderDetails(node);
      });

      searchEl.addEventListener("input", () => {
        const query = searchEl.value.trim().toLowerCase();
        if (!query) {
          searchResultsEl.style.display = "none";
          searchResultsEl.innerHTML = "";
          return;
        }
        const matches = NODES.filter((node) =>
          [node.label, node.sourceFile, node.categoryLabel, node.featureLabel].join(" ").toLowerCase().includes(query)
        ).slice(0, 18);
        searchResultsEl.style.display = "block";
        searchResultsEl.innerHTML = matches.map((node) =>
          '<div class="search-item" data-node-id="' + escapeAttr(node.id) + '">' +
          escapeHtml(node.label) + '<br><span class="muted">' + escapeHtml(node.sourceFile) + '</span></div>'
        ).join("");
      });

      searchResultsEl.addEventListener("click", (event) => {
        const item = event.target.closest("[data-node-id]");
        if (!item) return;
        const id = item.getAttribute("data-node-id");
        network.selectNodes([id]);
        network.focus(id, { scale: 1.2, animation: true });
        renderDetails(nodes.get(id));
      });

      function renderLegend() {
        legendEl.innerHTML = '<h2>Categories</h2>' + LEGEND.map((item) =>
          '<label class="legend-row"><input type="checkbox" checked data-category="' + escapeAttr(item.id) + '">' +
          '<span><span class="dot" style="background:' + item.color + '"></span>' + escapeHtml(item.label) + '</span>' +
          '<span class="count">' + item.count + '</span></label>'
        ).join("");

        legendEl.querySelectorAll("input[data-category]").forEach((checkbox) => {
          checkbox.addEventListener("change", () => {
            if (checkbox.checked) selectedCategories.add(checkbox.dataset.category);
            else selectedCategories.delete(checkbox.dataset.category);
            applyCategoryFilter();
          });
        });
      }

      function applyCategoryFilter() {
        const visible = new Set();
        nodes.update(NODES.map((node) => {
          const hidden = !selectedCategories.has(node.group);
          if (!hidden) visible.add(node.id);
          return { id: node.id, hidden };
        }));
        edges.update(EDGES.map((edge) => ({ id: edge.id, hidden: !visible.has(edge.from) || !visible.has(edge.to) })));
      }

      function renderDetails(node) {
        if (!node) return;
        detailsEl.innerHTML =
          '<h2>' + escapeHtml(node.label) + '</h2>' +
          '<div><span class="dot" style="background:' + node.color.background + '"></span>' + escapeHtml(node.categoryLabel) + '</div>' +
          '<div><strong>Area:</strong> ' + escapeHtml(node.featureLabel) + '</div>' +
          '<div><strong>Source:</strong> ' + escapeHtml(node.sourceFile) + '</div>' +
          '<div><strong>Files:</strong> ' + node.fileCount + '</div>' +
          '<div><strong>Symbols:</strong> ' + node.symbolCount + '</div>' +
          '<div><strong>Degree:</strong> ' + node.degree + '</div>';
      }

      function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
      }

      function escapeAttr(value) {
        return escapeHtml(value);
      }
    }
  </script>
</body>
</html>
`;
}

function buildCleanTreeHtml(graph) {
  const features = new Map();
  for (const node of graph.nodes) {
    if (!features.has(node.feature_label))
      features.set(node.feature_label, new Map());
    const categories = features.get(node.feature_label);
    if (!categories.has(node.category_label))
      categories.set(node.category_label, []);
    categories.get(node.category_label).push(node);
  }

  const body = [...features.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([feature, categories]) => {
      const categoryHtml = [...categories.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([category, nodes]) => {
          const items = nodes
            .sort((a, b) => a.label.localeCompare(b.label))
            .map(
              (node) =>
                `<li><code>${escapeHtml(node.source_file)}</code> <span>${escapeHtml(node.label)}</span> <small>${node.file_count} file${node.file_count === 1 ? "" : "s"}, degree ${node.degree}</small></li>`
            )
            .join("\n");
          return `<details open><summary>${escapeHtml(category)} (${nodes.length})</summary><ul>${items}</ul></details>`;
        })
        .join("\n");
      return `<section><h2>${escapeHtml(feature)}</h2>${categoryHtml}</section>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>LifeGroups Product Surface Tree</title>
  <style>
    body { margin: 32px; color: #111827; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.45; }
    h1 { margin-bottom: 4px; font-size: 24px; }
    h2 { margin-top: 28px; font-size: 18px; }
    details { border-top: 1px solid #e5e7eb; padding: 8px 0; }
    summary { cursor: pointer; font-weight: 650; }
    ul { margin: 8px 0 14px; padding-left: 22px; }
    li { margin: 4px 0; }
    code { color: #334155; }
    small { color: #64748b; margin-left: 8px; }
  </style>
</head>
<body>
  <h1>LifeGroups Product Surface Tree</h1>
  <p>${graph.nodes.length} clean file/module nodes grouped by product area and category.</p>
  ${body}
</body>
</html>
`;
}

function jsonForHtml(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function copyDurableOutputs(sourceDir, destDir, scopeName, scope) {
  mkdirSync(destDir, { recursive: true });
  for (const file of config.durableOutputs) {
    const source = path.join(sourceDir, file);
    if (!existsSync(source)) {
      fail(`Expected Graphify output missing: ${source}`);
    }
    copyFileWithRetry(source, path.join(destDir, file));
  }
  sanitizeDurableOutputs(destDir, scope);

  if (scopeName === "product") {
    removeLegacyRootArtifacts(destDir);
  } else {
    removeIgnoredGraphifyLocalState(destDir);
  }
}

function sanitizeDurableOutputs(destDir, scope) {
  const stableName = `LifeGroups ${scope.title}`;
  const htmlPath = path.join(destDir, "graph.html");
  const reportPath = path.join(destDir, "GRAPH_REPORT.md");

  if (existsSync(htmlPath)) {
    const html = readFileSync(htmlPath, "utf8").replace(
      /<title>graphify - .*?<\/title>/s,
      `<title>graphify - ${escapeHtml(stableName)}</title>`
    );
    writeTextFile(htmlPath, html);
  }

  if (existsSync(reportPath)) {
    const report = readFileSync(reportPath, "utf8").replace(
      /^# Graph Report - .*?(\s+\(\d{4}-\d{2}-\d{2}\))/m,
      `# Graph Report - ${stableName}$1`
    );
    writeTextFile(reportPath, report);
  }
}

function applyCommunityLabels(destDir, labels) {
  const labelByCommunity = new Map(
    labels.map((entry) => [String(entry.id), entry.label])
  );
  writeTextFile(
    path.join(destDir, ".graphify_labels.json"),
    `${JSON.stringify(Object.fromEntries(labelByCommunity), null, 2)}\n`
  );

  const replacements = [...labelByCommunity.entries()]
    .filter(([id, label]) => label !== `Community ${id}`)
    .sort((a, b) => b[0].length - a[0].length);

  const htmlPath = path.join(destDir, "graph.html");
  if (existsSync(htmlPath)) {
    let html = readFileSync(htmlPath, "utf8");
    for (const [id, label] of replacements) {
      html = html.replaceAll(
        `"community_name": "Community ${id}"`,
        `"community_name": ${JSON.stringify(label)}`
      );
      html = html.replaceAll(
        `"label": "Community ${id}"`,
        `"label": ${JSON.stringify(label)}`
      );
    }
    writeTextFile(htmlPath, html);
  }

  const reportPath = path.join(destDir, "GRAPH_REPORT.md");
  if (existsSync(reportPath)) {
    let report = readFileSync(reportPath, "utf8");
    for (const [id, label] of replacements) {
      report = report.replace(
        new RegExp(`Community ${escapeRegExp(id)}(?!\\d)`, "g"),
        label
      );
    }
    writeTextFile(reportPath, report);
  }
}

function removeLegacyRootArtifacts(destDir) {
  const legacyFiles = [
    ".graphify_analysis.json",
    ".graphify_labels.json",
    ".graphify_root",
    "architecture-overview.html",
    "CALLFLOW.html",
    "community-overview.html",
  ];
  for (const file of legacyFiles) {
    removeIfInside(path.join(destDir, file), outputRoot);
  }
  removeIgnoredGraphifyLocalState(destDir);
}

function removeIgnoredGraphifyLocalState(destDir) {
  for (const name of ["cache", "manifest.json"]) {
    removeIfInside(path.join(destDir, name), outputRoot);
  }
}

function buildScopeReport(scopeName, scope, graph, selected) {
  const analysis = analyzeGraph(graph);
  const audit = buildNoiseAudit(analysis.files, scopeName);
  const labels = inferCommunityLabels(analysis);
  const featureHubs = analysis.topHubs
    .filter(
      (hub) =>
        featureTag(hub.file) &&
        !isSharedPlumbing(hub) &&
        !isDataAuthBoundary(hub)
    )
    .slice(0, 16);
  const sharedHubs = analysis.topHubs.filter(isSharedPlumbing).slice(0, 16);
  const boundaryHubs = analysis.topHubs
    .filter((hub) => isDataAuthBoundary(hub) && !isSharedPlumbing(hub))
    .slice(0, 16);
  const coupling = crossFeatureCoupling(graph, analysis.nodeById).slice(0, 10);
  const candidates = cutCandidates(analysis).slice(0, 12);
  const noisy = noisyFiles(analysis, audit);

  return [
    `# ${scope.title} Graph Report`,
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    `- Scope: ${scopeName}`,
    `- Staged files: ${selected.files.length}`,
    `- Nodes: ${analysis.nodes.length}`,
    `- Edges: ${analysis.links.length}`,
    `- Communities: ${analysis.communityCount}`,
    `- Output: ${path.posix.join("graphify-out", scope.output === "." ? "" : scope.output) || "graphify-out"}`,
    "",
    "## Exclusion Audit",
    ...audit.map((item) => `- ${item.status}: ${item.label}: ${item.count}`),
    "",
    "## Excluded Candidate Files",
    ...formatCounts(selected.excluded),
    "",
    "## Feature hubs",
    ...formatHubs(featureHubs),
    "",
    "## Shared plumbing hubs",
    ...formatHubs(sharedHubs),
    "",
    "## Data/auth boundary hubs",
    ...formatHubs(boundaryHubs),
    "",
    "## Cross-feature coupling",
    ...formatCoupling(coupling),
    "",
    "## Cut candidates",
    ...formatCutCandidates(candidates),
    "",
    "## Noisy files",
    ...formatNoisyFiles(noisy),
    "",
    "## Inferred community labels",
    ...formatCommunityLabels(labels),
    "",
  ].join("\n");
}

function analyzeGraph(graph) {
  const nodes = graph.nodes || [];
  const links = graph.links || graph.edges || [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const degreeById = new Map();
  const inboundByFile = new Map();
  const outboundByFile = new Map();

  for (const link of links) {
    degreeById.set(link.source, (degreeById.get(link.source) || 0) + 1);
    degreeById.set(link.target, (degreeById.get(link.target) || 0) + 1);

    const sourceNode = nodeById.get(link.source);
    const targetNode = nodeById.get(link.target);
    const sourceFile = normalizeMaybe(
      sourceNode?.source_file || link.source_file
    );
    const targetFile = normalizeMaybe(targetNode?.source_file);
    if (sourceFile)
      outboundByFile.set(sourceFile, (outboundByFile.get(sourceFile) || 0) + 1);
    if (targetFile && sourceFile !== targetFile) {
      inboundByFile.set(targetFile, (inboundByFile.get(targetFile) || 0) + 1);
    }
  }

  const files = [
    ...new Set(
      nodes.map((node) => normalizeMaybe(node.source_file)).filter(Boolean)
    ),
  ].sort();
  const topHubs = nodes
    .map((node) => ({
      id: node.id,
      label: node.label || node.id,
      file: normalizeMaybe(node.source_file),
      community: node.community,
      degree: degreeById.get(node.id) || 0,
    }))
    .filter((node) => node.degree > 0)
    .sort(
      (a, b) =>
        b.degree - a.degree || String(a.file).localeCompare(String(b.file))
    );

  return {
    nodes,
    links,
    nodeById,
    files,
    topHubs,
    inboundByFile,
    outboundByFile,
    communityCount: new Set(
      nodes
        .map((node) => node.community)
        .filter((community) => community !== undefined)
    ).size,
  };
}

function buildNoiseAudit(files, scopeName) {
  const checks = [
    ["tests", /(^|\/)__tests__(\/|$)|\.(test|spec)\.[cm]?[tj]sx?$/i],
    [
      "generated DB types",
      /(^types\/database\.ts$|^lib\/supabase\/types\.ts$|database\.types\.ts$)/i,
    ],
    ["app/a11y-harness", /^app\/a11y-harness\//i],
    ["docs", /(^docs\/|\.mdx?$)/i],
    ["Graphify output/tooling", /(^graphify-out\/|^\.graphify\/|^graphify\/)/i],
    [
      "package/lock metadata",
      /(^package(-lock)?\.json$|skills-lock\.json$|components\.json$)/i,
    ],
  ];
  return checks.map(([label, pattern]) => {
    const count = files.filter((file) => pattern.test(file)).length;
    const expected =
      scopeName === "data-boundary" && label === "generated DB types";
    return {
      label,
      count,
      expected,
      status: count === 0 ? "OK" : expected ? "EXPECTED" : "CHECK",
    };
  });
}

function inferCommunityLabels(analysis) {
  const heuristics = labelConfig.heuristics.map((heuristic) => ({
    label: heuristic.label,
    patterns: heuristic.patterns.map((pattern) => new RegExp(pattern, "i")),
  }));
  const communities = new Map();
  for (const node of analysis.nodes) {
    if (node.community === undefined) continue;
    const key = String(node.community);
    if (!communities.has(key)) communities.set(key, []);
    communities.get(key).push(node);
  }

  return [...communities.entries()]
    .map(([id, nodes]) => {
      const match = bestCommunityHeuristic(nodes, heuristics);
      return {
        id,
        label: match?.label || fallbackCommunityLabel(nodes),
        nodes: nodes.length,
        topFiles: topFilesForNodes(nodes).slice(0, 4),
        basis: match ? "heuristic" : "top-file",
      };
    })
    .sort((a, b) => b.nodes - a.nodes || Number(a.id) - Number(b.id));
}

function bestCommunityHeuristic(nodes, heuristics) {
  return heuristics
    .map((heuristic, index) => {
      let score = 0;
      for (const node of nodes) {
        const file = normalizeMaybe(node.source_file);
        const label = String(node.label || "");
        for (const pattern of heuristic.patterns) {
          if (file && pattern.test(file)) score += 8;
          if (label && pattern.test(label)) score += 3;
        }
      }
      return { ...heuristic, index, score };
    })
    .filter((heuristic) => heuristic.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)[0];
}

function fallbackCommunityLabel(nodes) {
  const topFiles = topFilesForNodes(nodes).map(([file]) => file);
  const joined = topFiles.join("\n").toLowerCase();
  if (joined.includes("private-notes") || joined.includes("lib/crypto"))
    return "Private Notes Security";
  if (joined.includes("frozen-surface-copy")) return "Frozen Surface Copy";
  if (
    joined.includes("components/lg/shell") ||
    joined.includes("topbar") ||
    joined.includes("avatar")
  ) {
    return "Application Shell";
  }

  const primary = topFiles[0];
  if (!primary) return "Unclassified Code Cluster";
  return labelFromPath(primary);
}

function labelFromPath(file) {
  const normalized = normalizeMaybe(file);
  const parts = normalized.split("/").filter(Boolean);
  const filename = parts.at(-1) || normalized;
  const stem = filename.replace(/\.[cm]?[tj]sx?$/i, "");

  if (parts[0] === "app") {
    const routeParts = parts
      .slice(1, -1)
      .filter((part) => !part.startsWith("(") && !part.startsWith("["))
      .map(humanizePathPart);
    const routeName = titleCase(routeParts.slice(-2).join(" "));
    const kind = routeFileKind(stem);
    return routeName ? `${routeName} ${kind}` : `App Root ${kind}`;
  }

  if (parts[0] === "components") {
    const componentParts = parts.slice(1).map(humanizePathPart);
    const componentName = titleCase(componentParts.slice(-2).join(" "));
    return componentName ? `${componentName} Components` : "Component Cluster";
  }

  if (parts[0] === "lib") {
    const libParts = parts.slice(1).map(humanizePathPart);
    const libName = titleCase(libParts.slice(-2).join(" "));
    return libName ? `${libName} Logic` : "Library Logic";
  }

  if (parts[0] === "types") return `${titleCase(humanizePathPart(stem))} Types`;
  if (parts[0] === "supabase")
    return `${titleCase(parts.slice(-2).map(humanizePathPart).join(" "))} Database Boundary`;
  return (
    titleCase(parts.slice(-2).map(humanizePathPart).join(" ")) || "Code Cluster"
  );
}

function routeFileKind(stem) {
  if (stem === "page") return "Page";
  if (stem === "layout") return "Layout";
  if (stem === "actions") return "Actions";
  if (stem === "route") return "Route";
  return titleCase(humanizePathPart(stem));
}

function humanizePathPart(value) {
  return String(value)
    .replace(/\[[^\]]+\]/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\.[^.]+$/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
}

function titleCase(value) {
  return String(value)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function topFilesForNodes(nodes) {
  const counts = new Map();
  for (const node of nodes) {
    const file = normalizeMaybe(node.source_file);
    if (!file) continue;
    counts.set(file, (counts.get(file) || 0) + 1);
  }
  return [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  );
}

function crossFeatureCoupling(graph, nodeById) {
  const pairs = new Map();
  for (const link of graph.links || graph.edges || []) {
    const sourceNode = nodeById.get(link.source);
    const targetNode = nodeById.get(link.target);
    if (!sourceNode || !targetNode) continue;

    const sourceHub = hubFromNode(sourceNode, 0);
    const targetHub = hubFromNode(targetNode, 0);
    if (isSharedPlumbing(sourceHub) || isSharedPlumbing(targetHub)) continue;
    if (isDataAuthBoundary(sourceHub) || isDataAuthBoundary(targetHub))
      continue;

    const sourceFeature = featureTag(sourceHub.file);
    const targetFeature = featureTag(targetHub.file);
    if (!sourceFeature || !targetFeature || sourceFeature === targetFeature)
      continue;

    const key = [sourceFeature, targetFeature].sort().join(" <-> ");
    if (!pairs.has(key)) pairs.set(key, { pair: key, count: 0, examples: [] });
    const entry = pairs.get(key);
    entry.count += 1;

    const example = `${sourceHub.file || "(unknown)"} -> ${targetHub.file || "(unknown)"} (${link.relation || "edge"})`;
    if (!entry.examples.includes(example) && entry.examples.length < 5)
      entry.examples.push(example);
  }
  return [...pairs.values()].sort(
    (a, b) => b.count - a.count || a.pair.localeCompare(b.pair)
  );
}

function cutCandidates(analysis) {
  const byFile = new Map();
  for (const hub of analysis.topHubs) {
    if (!hub.file) continue;
    if (!/^app\/.*\/(page|layout|actions|route)\.tsx?$/.test(hub.file))
      continue;
    if (isSharedPlumbing(hub) || isDataAuthBoundary(hub)) continue;
    if (forbiddenCutCandidate(hub.file)) continue;

    const feature = featureTag(hub.file);
    if (!feature) continue;
    const current = byFile.get(hub.file) || {
      file: hub.file,
      feature,
      inbound: analysis.inboundByFile.get(hub.file) || 0,
      outbound: analysis.outboundByFile.get(hub.file) || 0,
      degree: 0,
      reason: candidateReason(hub.file),
    };
    current.degree += hub.degree;
    byFile.set(hub.file, current);
  }

  return [...byFile.values()]
    .filter((candidate) => candidate.inbound <= 3)
    .sort(
      (a, b) =>
        a.inbound - b.inbound ||
        a.outbound - b.outbound ||
        a.file.localeCompare(b.file)
    );
}

function noisyFiles(analysis, audit) {
  const includedNoise = audit
    .filter((item) => item.count > 0 && !item.expected)
    .map((item) => `${item.label}: ${item.count} included`);
  const dominantInfrastructure = analysis.topHubs
    .filter((hub) => isSharedPlumbing(hub) || isDataAuthBoundary(hub))
    .slice(0, 10)
    .map((hub) => `${hub.file || hub.label} (${hub.degree})`);
  return [...includedNoise, ...dominantInfrastructure];
}

function featureTag(file) {
  if (!file) return null;
  const value = file.toLowerCase();
  if (/shepherd-care|follow-up|over-shepherd|care-note|\/care\//.test(value))
    return "care";
  if (
    /launch-planning|leader-pipeline|\/plan\/|\/planning\/|prospect/.test(value)
  )
    return "plan";
  if (/multiply|multiplication|readiness|pillar/.test(value)) return "multiply";
  if (/calendar|check-in|checkin|occurrence|church-time/.test(value))
    return "calendar";
  if (
    /\/people\/|person-detail|people-directory|\/guests\/|guest|invite|member|profile/.test(
      value
    )
  )
    return "people";
  if (
    /\/groups\/|group-health|group-detail|group-management|groups-directory|health-rubric|capacity/.test(
      value
    )
  ) {
    return "groups";
  }
  if (
    /settings|feature-flag|app-config|editable-copy|group-categories|multiply-trigger/.test(
      value
    )
  )
    return "settings";
  if (/dashboard|\/admin\/page\.tsx|\/leader\/page\.tsx|home|nav/.test(value))
    return "home";
  return null;
}

function isSharedPlumbing(hub) {
  const value = `${hub.file || ""} ${hub.label || ""}`.toLowerCase();
  return (
    value.includes("lib/shared/") ||
    value.includes("lib/forms/") ||
    value.includes("lib/utils.ts") ||
    value.includes("components/ui/") ||
    value.includes("components/pastoral/") ||
    value.includes("components/auth/") ||
    value.includes("components/sign-in/") ||
    value.includes("components/admin/forms/action-form") ||
    value.includes("components/admin/forms/confirm-action-button") ||
    value.includes("components/admin/forms/field-styles") ||
    value.includes("runadminwriteaction") ||
    value.includes("calluuidrpc") ||
    value.includes("createsupabaseserverclient") ||
    value.includes("useactionform") ||
    value.includes("cn()") ||
    value.includes("action-result")
  );
}

function isDataAuthBoundary(hub) {
  const value = `${hub.file || ""} ${hub.label || ""}`.toLowerCase();
  return (
    value.includes("lib/supabase/") ||
    value.includes("lib/auth/") ||
    value.includes("middleware.ts") ||
    value.includes("app/auth/") ||
    value.includes("app/login/") ||
    value.includes("app/invite/") ||
    value.includes("app/forgot-password/") ||
    value.includes("app/reset-password/") ||
    value.includes("supabase/functions/") ||
    value.includes("supabase/migrations/") ||
    value.includes("types/database.ts") ||
    value.includes("lib/supabase/types.ts") ||
    value.includes("rpc.ts") ||
    value.includes("createSupabaseServerClient".toLowerCase())
  );
}

function forbiddenCutCandidate(file) {
  return /auth|rls|audit|rpc|session|middleware|settings|config|supabase|types\/enums|run-action/i.test(
    file
  );
}

function candidateReason(file) {
  if (
    /planning|check-ins|guests|leader-pipeline|group-health|launch-planning/i.test(
      file
    )
  ) {
    return "low-inbound hidden or legacy product surface";
  }
  return "low-inbound leaf route/action surface";
}

function hubFromNode(node, degree) {
  return {
    id: node.id,
    label: node.label || node.id,
    file: normalizeMaybe(node.source_file),
    community: node.community,
    degree,
  };
}

function formatHubs(hubs) {
  if (hubs.length === 0) return ["- None found."];
  return hubs.map(
    (hub) => `- ${hub.label} (${hub.degree}) - ${hub.file || "unknown file"}`
  );
}

function formatCounts(counts) {
  if (counts.size === 0) return ["- None."];
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label, count]) => `- ${label}: ${count}`);
}

function formatCoupling(coupling) {
  if (coupling.length === 0)
    return [
      "- None found after subtracting shared plumbing and data/auth boundary nodes.",
    ];
  return coupling.flatMap((entry) => [
    `- ${entry.pair}: ${entry.count} links`,
    ...entry.examples.map((example) => `  - ${example}`),
  ]);
}

function formatCutCandidates(candidates) {
  if (candidates.length === 0)
    return ["- None found by the low-coupling route/action heuristic."];
  return candidates.map(
    (candidate) =>
      `- ${candidate.file} - ${candidate.feature}, inbound ${candidate.inbound}, outbound ${candidate.outbound}; ${candidate.reason}`
  );
}

function formatNoisyFiles(noisy) {
  if (noisy.length === 0) return ["- None found."];
  return noisy.map((item) => `- ${item}`);
}

function formatCommunityLabels(labels) {
  if (labels.length === 0) return ["- None found."];
  return [
    "| Community | Label | Nodes | Basis | Top files |",
    "| --- | --- | ---: | --- | --- |",
    ...labels.map((entry) => {
      const topFiles = entry.topFiles
        .map(([file, count]) => `${file} (${count})`)
        .join("; ");
      return `| ${entry.id} | ${entry.label} | ${entry.nodes} | ${entry.basis} | ${topFiles} |`;
    }),
  ];
}

function writeOverview() {
  const graphPath = path.join(outputRoot, "graph.json");
  if (!existsSync(graphPath)) {
    fail(
      "graphify-out/graph.json does not exist. Run npm.cmd run graph:product first."
    );
  }

  const graph = readJson(graphPath);
  const analysis = analyzeGraph(graph);
  const labels = inferCommunityLabels(analysis);
  const coupling = crossFeatureCoupling(graph, analysis.nodeById).slice(0, 12);
  const overviewDir = path.join(outputRoot, "overview");
  mkdirSync(overviewDir, { recursive: true });

  const json = {
    generatedAt: new Date().toISOString(),
    source: "graphify-out/graph.json",
    nodeCount: analysis.nodes.length,
    edgeCount: analysis.links.length,
    communityCount: analysis.communityCount,
    topHubs: analysis.topHubs.slice(0, 40),
    communityLabels: labels,
    crossFeatureCoupling: coupling,
  };
  writeTextFile(
    path.join(overviewDir, ".graphify_analysis.json"),
    `${JSON.stringify(json, null, 2)}\n`
  );
  writeTextFile(
    path.join(overviewDir, "architecture-overview.html"),
    overviewHtml("Architecture Overview", json.topHubs, coupling)
  );
  writeTextFile(
    path.join(overviewDir, "community-overview.html"),
    communityHtml(labels)
  );
  console.log("[graphify] overview: wrote graphify-out/overview");
}

function overviewHtml(title, hubs, coupling) {
  return htmlPage(
    title,
    [
      "<h2>Top hubs</h2>",
      "<ul>",
      ...hubs.map(
        (hub) =>
          `<li><strong>${escapeHtml(hub.label)}</strong> (${hub.degree}) - ${escapeHtml(hub.file || "")}</li>`
      ),
      "</ul>",
      "<h2>Cross-feature coupling</h2>",
      "<ul>",
      ...coupling.map(
        (entry) =>
          `<li><strong>${escapeHtml(entry.pair)}</strong>: ${entry.count}</li>`
      ),
      "</ul>",
    ].join("\n")
  );
}

function communityHtml(labels) {
  return htmlPage(
    "Community Overview",
    [
      "<table>",
      "<thead><tr><th>Community</th><th>Label</th><th>Nodes</th><th>Top files</th></tr></thead>",
      "<tbody>",
      ...labels.map((entry) => {
        const files = entry.topFiles
          .map(([file, count]) => `${file} (${count})`)
          .join("; ");
        return `<tr><td>${escapeHtml(entry.id)}</td><td>${escapeHtml(entry.label)}</td><td>${entry.nodes}</td><td>${escapeHtml(files)}</td></tr>`;
      }),
      "</tbody>",
      "</table>",
    ].join("\n")
  );
}

function htmlPage(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 32px; color: #111827; line-height: 1.45; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  ${body}
</body>
</html>
`;
}

function mergeMatchers(...matchers) {
  const merged = {
    files: [],
    prefixes: [],
    suffixes: [],
    contains: [],
    regex: [],
  };
  for (const matcher of matchers.filter(Boolean)) {
    for (const key of Object.keys(merged)) {
      merged[key].push(...(matcher[key] || []));
    }
  }
  return merged;
}

function matchesMatcher(file, matcher = {}) {
  const normalized = normalizePath(file);
  return (
    (matcher.files || []).some(
      (entry) => normalized === normalizePath(entry)
    ) ||
    (matcher.prefixes || []).some((prefix) =>
      normalized.startsWith(normalizePath(prefix))
    ) ||
    (matcher.suffixes || []).some((suffix) => normalized.endsWith(suffix)) ||
    (matcher.contains || []).some((part) =>
      normalized.includes(normalizePath(part))
    ) ||
    (matcher.regex || []).some((pattern) =>
      new RegExp(pattern, "i").test(normalized)
    )
  );
}

function firstMatchingRule(file, rules) {
  return rules.find((rule) => matchesMatcher(file, rule));
}

function runGraphify(args, extraEnv) {
  console.log(`[graphify] ${["graphify", ...args].join(" ")}`);
  const result = spawnSync(getGraphify(), args, {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
  });
  if (result.status !== 0) {
    fail(`Graphify failed with exit code ${result.status}`);
  }
}

function getGraphify() {
  if (graphifyExe) return graphifyExe;
  graphifyExe = resolveGraphify();
  assertPinnedGraphifyVersion(graphifyExe);
  return graphifyExe;
}

function resolveGraphify() {
  const envPath = process.env.GRAPHIFY_BIN;
  const candidates = [
    envPath,
    "graphify",
    process.env.APPDATA
      ? path.join(
          process.env.APPDATA,
          "Python",
          "Python312",
          "Scripts",
          "graphify.exe"
        )
      : null,
    path.join(
      process.env.USERPROFILE || "",
      "AppData",
      "Roaming",
      "Python",
      "Python312",
      "Scripts",
      "graphify.exe"
    ),
    path.join(
      process.env.LOCALAPPDATA || "",
      "Programs",
      "Python",
      "Python312",
      "Scripts",
      "graphify.exe"
    ),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate === "graphify") {
      const result = spawnSync(candidate, ["--version"], { encoding: "utf8" });
      if (result.status === 0) return candidate;
      continue;
    }
    if (existsSync(candidate)) return candidate;
  }

  fail(
    "Unable to find graphify. Install graphifyy or set GRAPHIFY_BIN to graphify.exe."
  );
}

function assertPinnedGraphifyVersion(exe) {
  const versionFile = path.join(ROOT, ".graphify-version");
  if (!existsSync(versionFile)) return;
  const expected = readFileSync(versionFile, "utf8").trim();
  if (!expected) return;

  const result = spawnSync(exe, ["--version"], { cwd: ROOT, encoding: "utf8" });
  if (result.status !== 0) {
    fail("Unable to check graphify version.");
  }
  const actual = result.stdout.trim().split(/\s+/).pop();
  if (actual !== expected) {
    fail(
      `graphify version ${actual} does not match .graphify-version ${expected}`
    );
  }
}

function writeTree() {
  const graphPath = path.join(outputRoot, "graph.json");
  if (!existsSync(graphPath)) {
    fail(
      "graphify-out/graph.json does not exist. Run npm.cmd run graph:product first."
    );
  }
  runGraphify(
    [
      "tree",
      "--graph",
      graphPath,
      "--output",
      path.join(outputRoot, "GRAPH_TREE.html"),
      "--root",
      ROOT,
      "--label",
      "LifeGroups Product Surface",
    ],
    {}
  );
}

function runHealth() {
  const graphPath = path.join(outputRoot, "graph.json");
  if (!existsSync(graphPath)) {
    fail(
      "graphify-out/graph.json does not exist. Run npm.cmd run graph:product first."
    );
  }
  runGraphify(["diagnose", "multigraph", "--graph", graphPath], {});
  runGraphify(["benchmark", graphPath], {});
}

function resetDirectory(target, allowedRoot) {
  const resolvedTarget = path.resolve(target);
  const resolvedRoot = path.resolve(allowedRoot);
  if (!isInside(resolvedTarget, resolvedRoot)) {
    fail(`Refusing to reset outside ${resolvedRoot}: ${resolvedTarget}`);
  }
  rmSync(resolvedTarget, { recursive: true, force: true });
  mkdirSync(resolvedTarget, { recursive: true });
}

function removeIfInside(target, allowedRoot) {
  const resolvedTarget = path.resolve(target);
  const resolvedRoot = path.resolve(allowedRoot);
  if (!isInside(resolvedTarget, resolvedRoot)) {
    fail(`Refusing to remove outside ${resolvedRoot}: ${resolvedTarget}`);
  }
  if (!existsSync(resolvedTarget)) return;
  const stat = statSync(resolvedTarget);
  rmSync(resolvedTarget, { recursive: stat.isDirectory(), force: true });
}

function isInside(target, allowedRoot) {
  return (
    target === allowedRoot || target.startsWith(`${allowedRoot}${path.sep}`)
  );
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function copyFileWithRetry(source, target) {
  retryTransientFsOperation(() => copyFileSync(source, target), target);
}

function writeTextFile(file, content) {
  retryTransientFsOperation(() => writeFileSync(file, content), file);
}

function retryTransientFsOperation(operation, target) {
  let lastError;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      operation();
      return;
    } catch (error) {
      lastError = error;
      if (!isTransientFsError(error) || attempt === 8) break;
      sleep(125 * attempt);
    }
  }
  throw lastError || new Error(`Unable to write ${target}`);
}

function isTransientFsError(error) {
  return ["EBUSY", "EPERM", "EACCES", "UNKNOWN"].includes(error?.code);
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function normalizeMaybe(file) {
  return file ? normalizePath(file) : "";
}

function normalizePath(file) {
  return file.replace(/\\/g, "/").replace(/^\.\//, "");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fail(message) {
  console.error(`[graphify] ${message}`);
  process.exit(1);
}
