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

  for (const entry of options.roots) {
    const abs = resolve(root, entry);
    let stat;
    try {
      stat = statSync(abs);
    } catch {
      continue; // A listed root may not exist in every checkout.
    }
    if (stat.isDirectory()) {
      walk(abs, found);
    } else if (stat.isFile()) {
      // A file root (e.g. `proxy.ts`, the request-level middleware) is a real
      // scan target — enqueue it directly so the extension filter can keep it,
      // rather than silently dropping it for not being a directory.
      found.push(abs);
    }
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

// Words after which a `/` starts a regex literal, not a division — so the scan
// doesn't misread `return /['"]/` as a string. Combined with the punctuation
// set below this covers the real shapes in this repo (`if (/["(),]/.test(...))`,
// `.replace(/'/g, "''")`).
const REGEX_PREFIX_KEYWORDS = new Set([
  "return",
  "typeof",
  "instanceof",
  "in",
  "of",
  "case",
  "do",
  "else",
  "yield",
  "await",
  "void",
  "delete",
  "new",
]);

// A `/` begins a regex literal when the previous significant code is empty,
// an operator/opening punctuation, or one of the keywords above — never after a
// value (identifier, number, `)`, `]`, string/regex close).
function regexAllowed(lastSig: string, trailingWord: string): boolean {
  if (lastSig === "") return true;
  if ("=(,[{;:!&|?+-*/%^~<>".includes(lastSig)) return true;
  return REGEX_PREFIX_KEYWORDS.has(trailingWord);
}

/**
 * Strip line (`//`) and block (`/* *\/`) comments — and, when `blankStrings` is
 * true, string/template/regex literals — to spaces, so a structural scan matches
 * real code rather than a path printed in a comment or a sample string. Newlines
 * are preserved so line numbers stay aligned.
 *
 * Regex literals are recognised (with char-class `[...]` awareness) so a quote
 * inside one — e.g. `/['"]/` — does NOT flip the scanner into string mode and
 * blank the rest of the file. Not a full tokenizer, but it errs toward blanking,
 * which only ever REMOVES a match.
 *
 * `blankStrings: false` keeps string contents (used by scans that must still see
 * a literal — a `select("*")`, an email/UUID, an import path — while ignoring
 * comments); `true` blanks them too (used by the direct-write scan, where a
 * table name or a `.insert` mention inside a string must not match).
 */
export function stripCode(
  source: string,
  options: { blankStrings: boolean }
): string {
  const { blankStrings } = options;
  let out = "";
  let i = 0;
  const n = source.length;
  type Mode =
    | "code"
    | "line"
    | "block"
    | "single"
    | "double"
    | "template"
    | "regex";
  let mode: Mode = "code";
  let inCharClass = false; // inside a regex `[...]`
  let lastSig = ""; // last significant code char emitted
  let trailingWord = ""; // identifier currently being emitted (for keyword check)

  const pushCode = (ch: string) => {
    out += ch;
    if (/\s/.test(ch)) {
      if (ch === "\n") trailingWord = "";
    } else {
      lastSig = ch;
      trailingWord = /[A-Za-z0-9_$]/.test(ch) ? trailingWord + ch : "";
    }
  };

  // Emit a blanked char for a stripped literal: keep newlines, else a space.
  const blank = (ch: string) => {
    out += ch === "\n" ? "\n" : " ";
  };

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
      } else if (c === "/" && regexAllowed(lastSig, trailingWord)) {
        mode = "regex";
        inCharClass = false;
        blank(c);
        i += 1;
      } else if (c === "'" || c === '"' || c === "`") {
        mode = c === "'" ? "single" : c === '"' ? "double" : "template";
        if (blankStrings) blank(c);
        else pushCode(c);
        i += 1;
      } else {
        pushCode(c);
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

    if (mode === "regex") {
      // Regex literals are always blanked (they are never a scan target).
      if (c === "\\") {
        i += 2; // escape — skip the escaped char
        continue;
      }
      if (c === "[") inCharClass = true;
      else if (c === "]") inCharClass = false;
      else if (c === "/" && !inCharClass) {
        mode = "code";
        lastSig = "/"; // a regex value closed; the next `/` is division
        trailingWord = "";
      } else if (c === "\n") {
        out += "\n";
      }
      i += 1;
      continue;
    }

    // Inside a string/template literal: skip escapes, end on the closer.
    if (c === "\\") {
      if (!blankStrings) out += source.slice(i, i + 2);
      i += 2;
      continue;
    }
    const closer =
      (mode === "single" && c === "'") ||
      (mode === "double" && c === '"') ||
      (mode === "template" && c === "`");
    if (closer) {
      mode = "code";
      if (blankStrings) blank(c);
      else pushCode(c);
    } else if (blankStrings) {
      blank(c);
    } else {
      pushCode(c);
    }
    i += 1;
  }

  return out;
}

/** Strip comments only — keep string/regex contents. */
export function stripComments(source: string): string {
  return stripCode(source, { blankStrings: false });
}

/** Strip comments AND string/template/regex literals (to spaces). */
export function stripCommentsAndStrings(source: string): string {
  return stripCode(source, { blankStrings: true });
}
