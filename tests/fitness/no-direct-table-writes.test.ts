import { describe, expect, it } from "vitest";

import {
  readSourceFiles,
  stripCommentsAndStrings,
  type SourceFile,
} from "./support/source-globber";
import { TEST_FILE_EXCLUDES } from "./support/scan";

// P0 invariant: app/runtime code never writes Supabase tables directly. Every
// app-driven write goes through a narrow `SECURITY DEFINER` RPC (the
// `admin_*` / `leader_*` / `over_shepherd_*` / `super_admin_*` families) so the
// paired `audit_events` row lands in the same transaction. A direct
// `.from("…").insert|update|delete|upsert(…)` bypasses that and is a P0.
//
// Detection anchors on `.from(` to avoid false positives from Set/Map `.delete`
// or unrelated `.update`. Comments and string literals are stripped first so a
// table name or a documented example never trips the scan; test/fixture code
// (which provisions rows through the service client) is out of scope.

const RUNTIME = readSourceFiles({
  roots: ["app", "lib", "proxy.ts"],
  extensions: [".ts", ".tsx"],
  exclude: [...TEST_FILE_EXCLUDES],
});

const WRITE_METHOD = /\.(insert|update|delete|upsert)\s*\(/;

// Find `.from(...)` call chains that reach a write method before the statement
// ends. Works on comment/string-stripped, newline-flattened text so a chain
// spread across lines is still seen as one statement. A statement boundary is a
// `;` or `{`; we also cap the look-ahead window to keep matching local.
function findDirectWrites(file: SourceFile): string[] {
  const flat = stripCommentsAndStrings(file.text).replace(/\s+/g, " ");
  const hits: string[] = [];
  const fromRe = /\.from\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = fromRe.exec(flat)) !== null) {
    const start = m.index;
    // Window from this `.from(` to the next statement boundary (or 400 chars).
    const rest = flat.slice(start, start + 400);
    const boundary = rest.search(/[;{]/);
    const segment = boundary === -1 ? rest : rest.slice(0, boundary);
    const w = segment.match(WRITE_METHOD);
    if (w) hits.push(`${file.relPath}: …${segment.trim().slice(0, 120)}…`);
  }
  return hits;
}

describe("fitness: no direct Supabase table writes in runtime code", () => {
  it("app/** and lib/** never .from(...).insert|update|delete|upsert", () => {
    const hits = RUNTIME.flatMap(findDirectWrites);
    expect(
      hits,
      hits.length === 0
        ? ""
        : `Writes must go through a SECURITY DEFINER RPC, not a direct table ` +
            `write:\n${hits.map((h) => `  ${h}`).join("\n")}`
    ).toEqual([]);
  });
});
