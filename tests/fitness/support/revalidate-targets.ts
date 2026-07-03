// Revalidate-path fingerprint extraction for the fitness suite (issue #824).
//
// Pure static analysis in the suite's regex-over-stripped-source idiom: given
// comment-stripped action-module text (strings kept), derive for each write
// action the SET of root-relative paths its `revalidate` declaration can emit,
// so `write-action-revalidate-paths.test.ts` can pin that set against a
// maintained expected map.
//
// Normalization rules (a fingerprint value is a sorted, deduped string array):
// - a plain string/template path literal starting with "/" is kept verbatim;
// - template interpolations are collapsed: `/admin/x/${id}` → "/admin/x/${*}";
// - a typed target `{ path, type: "page" | "layout" }` becomes
//   "<type>:<path>" (e.g. "page:/admin/shepherd-care/[profileId]");
// - identifiers in a `revalidate` body that name a SAME-FILE top-level
//   declaration (path helpers, path consts) are resolved transitively.
//
// Documented limits (see the test header): the fingerprint is the union over
// conditional branches, runtime filtering inside helpers is invisible, and
// resolution is same-file only. An extraction that yields NO literals for a
// spec is reported as an error, never silently pinned as [] — so an imported
// path helper or a new declaration shape fails loudly instead of drifting.

import type { SourceFile } from "./source-globber";

/** Dotted write-action spec name (`admin.plan.create_prospect`). */
const SPEC_NAME_RE = /\bname:\s*["']([a-z0-9_]+(?:\.[a-z0-9_]+)+)["']/g;

const REVALIDATE_PROP_RE = /\brevalidate:/g;

/** Top-level (column-0) declaration boundary — Prettier guarantees these. */
const TOP_LEVEL_BOUNDARY_RE =
  /^(?:export\s+)?(?:async\s+)?(?:const|let|function|type|interface|class|import)\b/;

/** Identifier of a resolvable top-level value declaration. */
const DECLARATION_IDENT_RE =
  /^(?:export\s+)?(?:async\s+)?(?:const|let|function)\s+([A-Za-z_$][\w$]*)/;

/** `revalidatePath(...)` call site in a hand-rolled (non-runner) action. */
const DIRECT_CALL_RE = /\brevalidatePath\(/;

/** Two-arg literal form: `revalidatePath("/x", "layout")`. */
const DIRECT_TYPED_CALL_RE =
  /\brevalidatePath\(\s*(["'`])([^"'`]*)\1\s*,\s*["'](page|layout)["']\s*\)/;

/** Two-arg identifier form: `revalidatePath(DETAIL, "page")`. */
const DIRECT_TYPED_IDENT_CALL_RE =
  /\brevalidatePath\(\s*([A-Za-z_$][\w$]*)\s*,\s*["'](page|layout)["']\s*\)/;

/** `{ path: "...", type: "page" }` typed target (either property order). */
const TYPED_TARGET_RES = [
  /\{\s*path:\s*(["'`])([^"'`]+)\1\s*,\s*type:\s*["'](page|layout)["']\s*,?\s*\}/g,
  /\{\s*type:\s*["'](page|layout)["']\s*,\s*path:\s*(["'`])([^"'`]+)\2\s*,?\s*\}/g,
] as const;

const STRING_LITERAL_RE = /(["'])((?:\\.|(?!\1)[^\\])*)\1/g;
const TEMPLATE_LITERAL_RE = /`((?:\\.|[^\\`])*)`/g;
const IDENT_RE = /\b[A-Za-z_$][\w$]*\b/g;

export interface RevalidateExtraction {
  /**
   * Fingerprints keyed by spec name (runner actions) or
   * `file:<relPath>#direct` (hand-rolled `revalidatePath` callers). Values are
   * sorted, deduped normalized path strings.
   */
  readonly entries: Readonly<Record<string, readonly string[]>>;
  /** Human-readable extraction failures; the test asserts this is empty. */
  readonly errors: readonly string[];
}

/** Map each top-level `const`/`function` identifier to its segment text. */
export function indexTopLevelDeclarations(text: string): Map<string, string> {
  const lines = text.split("\n");
  const boundaries: number[] = [];
  lines.forEach((line, i) => {
    if (TOP_LEVEL_BOUNDARY_RE.test(line)) boundaries.push(i);
  });

  const index = new Map<string, string>();
  boundaries.forEach((startLine, b) => {
    const endLine =
      b + 1 < boundaries.length ? boundaries[b + 1] : lines.length;
    const segment = lines.slice(startLine, endLine).join("\n");
    const ident = DECLARATION_IDENT_RE.exec(lines[startLine])?.[1];
    if (ident) index.set(ident, segment);
  });
  return index;
}

/**
 * Slice the value of a `revalidate:` property starting at `start` (just past
 * the colon). Quote- and `${}`-aware balanced scan; the value ends at the
 * first `,` or `}` at depth 0 outside any string.
 */
export function revalidateValueExtent(text: string, start: number): string {
  type Frame = { kind: "'" | '"' | "`" } | { kind: "${"; depth: number };
  const stack: Frame[] = [];
  let depth = 0;

  for (let i = start; i < text.length; i++) {
    const c = text[i];
    const top = stack[stack.length - 1];

    if (top?.kind === "'" || top?.kind === '"') {
      if (c === "\\") i += 1;
      else if (c === top.kind) stack.pop();
      continue;
    }
    if (top?.kind === "`") {
      if (c === "\\") i += 1;
      else if (c === "`") stack.pop();
      else if (c === "$" && text[i + 1] === "{") {
        // Record the depth BEFORE the interpolation brace, then count it, so
        // the matching `}` below pops back into the template string.
        stack.push({ kind: "${", depth });
        depth += 1;
        i += 1;
      }
      continue;
    }

    // Code state (possibly inside a template `${…}` expression).
    if (c === "'" || c === '"' || c === "`") {
      stack.push({ kind: c });
    } else if (c === "(" || c === "[" || c === "{") {
      depth += 1;
    } else if (c === ")" || c === "]") {
      depth -= 1;
    } else if (c === "}") {
      if (top?.kind === "${" && depth - 1 === top.depth) {
        stack.pop();
        depth -= 1;
        continue;
      }
      if (depth === 0) return text.slice(start, i);
      depth -= 1;
    } else if (c === "," && depth === 0) {
      return text.slice(start, i);
    }
  }
  return text.slice(start);
}

interface Harvest {
  readonly paths: Set<string>;
  readonly errors: string[];
}

function normalizeTemplate(
  raw: string,
  errors: string[],
  where: string
): string {
  const normalized = raw.replace(/\$\{[^}]*\}/g, "${*}");
  if (normalized.includes("${") && !normalized.includes("${*}")) {
    errors.push(
      `${where}: template literal with nested interpolation the extractor ` +
        `cannot normalize: \`${raw}\``
    );
  }
  return normalized;
}

/**
 * Collect normalized path literals from `block`, resolving identifiers through
 * `declarations` transitively (`visited` breaks cycles).
 */
function harvestBlock(
  block: string,
  declarations: Map<string, string>,
  visited: Set<string>,
  out: Harvest,
  where: string
): void {
  let text = block;

  // Typed targets first, blanked out so their path string is not re-harvested
  // as a bare (untyped) path.
  for (const re of TYPED_TARGET_RES) {
    text = text.replace(re, (...m) => {
      const [path, type] =
        typeof m[2] === "string" && (m[3] === "page" || m[3] === "layout")
          ? [m[2] as string, m[3] as string]
          : [m[3] as string, m[1] as string];
      const normalized = normalizeTemplate(path, out.errors, where);
      if (normalized.startsWith("/")) out.paths.add(`${type}:${normalized}`);
      return " ".repeat(m[0].length);
    });
  }

  for (const m of text.matchAll(TEMPLATE_LITERAL_RE)) {
    const normalized = normalizeTemplate(m[1], out.errors, where);
    if (normalized.startsWith("/")) out.paths.add(normalized);
  }
  const withoutTemplates = text.replace(TEMPLATE_LITERAL_RE, " ");
  for (const m of withoutTemplates.matchAll(STRING_LITERAL_RE)) {
    if (m[2].startsWith("/")) out.paths.add(m[2]);
  }

  // Same-file top-level references (path helpers / consts), transitively.
  const withoutStrings = withoutTemplates.replace(STRING_LITERAL_RE, " ");
  for (const m of withoutStrings.matchAll(IDENT_RE)) {
    const ident = m[0];
    if (visited.has(ident)) continue;
    const declaration = declarations.get(ident);
    if (!declaration) continue;
    visited.add(ident);
    harvestBlock(declaration, declarations, visited, out, where);
  }
}

/**
 * Extract every write action's revalidate-path fingerprint from the given
 * comment-stripped action modules.
 */
export function extractRevalidateFingerprints(
  files: readonly SourceFile[]
): RevalidateExtraction {
  const entries: Record<string, readonly string[]> = {};
  const errors: string[] = [];

  for (const file of files) {
    const declarations = indexTopLevelDeclarations(file.text);

    // --- Runner specs: pair the i-th `name:` with the i-th `revalidate:`. ---
    const marks: Array<{
      pos: number;
      kind: "name" | "revalidate";
      name?: string;
    }> = [];
    for (const m of file.text.matchAll(SPEC_NAME_RE)) {
      marks.push({ pos: m.index ?? 0, kind: "name", name: m[1] });
    }
    for (const m of file.text.matchAll(REVALIDATE_PROP_RE)) {
      marks.push({ pos: m.index ?? 0, kind: "revalidate" });
    }
    marks.sort((a, b) => a.pos - b.pos);

    const alternates =
      marks.length % 2 === 0 &&
      marks.every((mark, i) =>
        i % 2 === 0 ? mark.kind === "name" : mark.kind === "revalidate"
      );
    if (!alternates && marks.length > 0) {
      errors.push(
        `${file.relPath}: spec \`name:\` / \`revalidate:\` properties do not ` +
          `strictly alternate (name first); restructure the spec to the ` +
          `prevailing shape or extend the extractor in revalidate-targets.ts`
      );
      continue;
    }

    for (let i = 0; i < marks.length; i += 2) {
      const specName = marks[i].name as string;
      const revalidateMark = marks[i + 1];
      const valueStart = revalidateMark.pos + "revalidate:".length;
      const block = revalidateValueExtent(file.text, valueStart);
      const harvest: Harvest = { paths: new Set(), errors: [] };
      harvestBlock(
        block,
        declarations,
        new Set(),
        harvest,
        `${file.relPath} → ${specName}`
      );
      errors.push(...harvest.errors);
      if (harvest.paths.size === 0) {
        errors.push(
          `${file.relPath} → ${specName}: no path literals reachable from its ` +
            `revalidate declaration (imported helper? new shape?); the ` +
            `fingerprint would be empty, which is never pinned silently`
        );
        continue;
      }
      if (specName in entries) {
        errors.push(`duplicate spec name across files: ${specName}`);
        continue;
      }
      entries[specName] = [...harvest.paths].sort();
    }

    // --- Hand-rolled direct `revalidatePath(...)` call sites. ---
    const directPaths = new Set<string>();
    let sawDirect = false;
    for (const line of file.text.split("\n")) {
      if (!DIRECT_CALL_RE.test(line)) continue;
      sawDirect = true;
      const typed = DIRECT_TYPED_CALL_RE.exec(line);
      if (typed) {
        const normalized = normalizeTemplate(
          typed[2],
          errors,
          `${file.relPath} (direct)`
        );
        directPaths.add(`${typed[3]}:${normalized}`);
        continue;
      }
      // Typed call with an identifier path — resolve it and keep the type
      // prefix, so a const wildcard target never degrades to an exact path.
      const typedIdent = DIRECT_TYPED_IDENT_CALL_RE.exec(line);
      if (typedIdent) {
        const harvest: Harvest = { paths: new Set(), errors: [] };
        harvestBlock(
          declarations.get(typedIdent[1]) ?? "",
          declarations,
          new Set([typedIdent[1]]),
          harvest,
          `${file.relPath} (direct)`
        );
        errors.push(...harvest.errors);
        if (harvest.paths.size === 0) {
          errors.push(
            `${file.relPath}: typed revalidatePath call whose path ` +
              `identifier the extractor cannot resolve: ${line.trim()}`
          );
          continue;
        }
        for (const p of harvest.paths) {
          directPaths.add(p.includes(":/") ? p : `${typedIdent[2]}:${p}`);
        }
        continue;
      }
      const harvest: Harvest = { paths: new Set(), errors: [] };
      harvestBlock(
        line,
        declarations,
        new Set(),
        harvest,
        `${file.relPath} (direct)`
      );
      errors.push(...harvest.errors);
      if (harvest.paths.size === 0) {
        errors.push(
          `${file.relPath}: direct revalidatePath call whose argument the ` +
            `extractor cannot resolve to any path literal: ${line.trim()}`
        );
        continue;
      }
      for (const p of harvest.paths) directPaths.add(p);
    }
    if (sawDirect && directPaths.size > 0) {
      entries[`file:${file.relPath}#direct`] = [...directPaths].sort();
    }
  }

  return { entries, errors };
}

/** Render entries as ready-to-paste lines for the expected map. */
export function renderMapEntries(
  entries: Readonly<Record<string, readonly string[]>>
): string {
  return Object.keys(entries)
    .sort()
    .map(
      (key) =>
        `  "${key}": [${entries[key].map((p) => JSON.stringify(p)).join(", ")}],`
    )
    .join("\n");
}
