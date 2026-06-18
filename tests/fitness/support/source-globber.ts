// Shared source-scan support for the fitness suite (issue #692).
//
// The fitness checks are PURE STATIC scans: they read source text off disk and
// assert structural invariants (no service-role in runtime code, no
// `select("*")`, no direct table writes, …). They never touch a database or
// need credentials, so they run in the default gating lane (`npm run test:run`).
//
// This module is the one place that knows how to walk the repo tree and hand
// back file contents. Issues #694 (data-classification) and #695 (route
// registry) reuse it to enumerate schema/route source, so keep it dependency-free
// (just `node:fs`/`node:path`) and total.

import { readdirSync, readFileSync, statSync, type Dirent } from "node:fs";
import { resolve, relative, sep } from "node:path";

// Vitest runs from the repo root, mirroring `tests/integration/support/env.ts`.
export function repoRoot(): string {
  return process.cwd();
}

/** A scanned source file: its repo-relative POSIX path and full text. */
export interface SourceFile {
  /** Repo-relative path using forward slashes (stable across platforms). */
  readonly relPath: string;
  /** Absolute path on disk. */
  readonly absPath: string;
  /** Full UTF-8 file contents. */
  readonly text: string;
}

export interface GlobOptions {
  /** Repo-relative directories to walk (e.g. ["app", "lib"]). */
  readonly roots: readonly string[];
  /** File extensions to include, with leading dot (e.g. [".ts", ".tsx"]). */
  readonly extensions: readonly string[];
  /**
   * Repo-relative path fragments to skip. A file/dir is excluded when its
   * POSIX relPath contains any fragment as a path segment boundary substring.
   */
  readonly exclude?: readonly string[];
}

// Directories that never hold reviewable source. Always skipped on top of any
// caller-supplied excludes so a stray build/worktree copy can't double-run a
// scan or surface false positives from in-progress work.
const ALWAYS_SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "coverage",
  ".claude",
]);

function toPosix(p: string): string {
  return p.split(sep).join("/");
}

// A listed root may not exist in every checkout; missing dirs skip quietly.
function safeReadDir(absDir: string): Dirent[] {
  try {
    return readdirSync(absDir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function walk(absDir: string, out: string[]): void {
  const entries = safeReadDir(absDir);
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (ALWAYS_SKIP_DIRS.has(entry.name)) continue;
      walk(resolve(absDir, entry.name), out);
    } else if (entry.isFile()) {
      out.push(resolve(absDir, entry.name));
    }
  }
}

/** Enumerate repo-relative POSIX paths under `roots` matching `extensions`. */
export function listSourceFiles(options: GlobOptions): string[] {
  const root = repoRoot();
  const exclude = options.exclude ?? [];
  const found: string[] = [];

  for (const dir of options.roots) {
    const absDir = resolve(root, dir);
    try {
      if (!statSync(absDir).isDirectory()) continue;
    } catch {
      continue;
    }
    walk(absDir, found);
  }

  return found
    .map((abs) => toPosix(relative(root, abs)))
    .filter((rel) => options.extensions.some((ext) => rel.endsWith(ext)))
    .filter((rel) => !exclude.some((frag) => rel.includes(frag)))
    .sort();
}

/** Like `listSourceFiles`, but reads each file's contents. */
export function readSourceFiles(options: GlobOptions): SourceFile[] {
  const root = repoRoot();
  return listSourceFiles(options).map((relPath) => {
    const absPath = resolve(root, relPath);
    return { relPath, absPath, text: readFileSync(absPath, "utf8") };
  });
}

/**
 * Strip line (`//`) and block (`/* *\/`) comments and string/template literals
 * to a single space, so a structural scan matches real code, not a path printed
 * in a comment or a sample string. Deliberately simple (not a full tokenizer):
 * it errs toward blanking, which can only ever REMOVE a match — a checker that
 * wants to be conservative should scan the raw text instead.
 */
export function stripCommentsAndStrings(source: string): string {
  let out = "";
  let i = 0;
  const n = source.length;
  type Mode = "code" | "line" | "block" | "single" | "double" | "template";
  let mode: Mode = "code";

  while (i < n) {
    const c = source[i];
    const next = source[i + 1];

    if (mode === "code") {
      if (c === "/" && next === "/") {
        mode = "line";
        i += 2;
      } else if (c === "/" && next === "*") {
        mode = "block";
        i += 2;
      } else if (c === "'") {
        mode = "single";
        out += " ";
        i += 1;
      } else if (c === '"') {
        mode = "double";
        out += " ";
        i += 1;
      } else if (c === "`") {
        mode = "template";
        out += " ";
        i += 1;
      } else {
        out += c;
        i += 1;
      }
      continue;
    }

    if (mode === "line") {
      if (c === "\n") {
        mode = "code";
        out += "\n";
      }
      i += 1;
      continue;
    }

    if (mode === "block") {
      if (c === "*" && next === "/") {
        mode = "code";
        i += 2;
      } else {
        if (c === "\n") out += "\n";
        i += 1;
      }
      continue;
    }

    // Inside a string/template literal: skip escapes, end on the closer.
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (
      (mode === "single" && c === "'") ||
      (mode === "double" && c === '"') ||
      (mode === "template" && c === "`")
    ) {
      mode = "code";
    } else if (c === "\n") {
      out += "\n";
    }
    i += 1;
  }

  return out;
}
