import { describe, expect, it } from "vitest";

import { DATA_CLASSIFICATION } from "@/lib/security/data-classification";
import {
  readSourceFiles,
  stripCommentsAndStrings,
} from "./support/source-globber";

// Log-leak guard (issue #699). Structured log context (`LogContext` in
// lib/observability/logger.ts) is freeform (`[key: string]: unknown`), so there
// is no static field allowlist to assert against. Instead this guards the CALL
// SITES: no `log.{info,warn,error}(…)` (or `startActionLog(…)`) context may key
// on a sensitive column name. The repo already routes identity through
// `hashEmail()` (→ `email_hash`, not `email`) and records presence (`ip_present`,
// `has_*`); this codifies that so a future `{ email: …, note: … }` log fails.
//
// `policy_tbd` columns count as sensitive (they are `isSensitive`), so they're
// covered by deriving the column set straight from the manifest.

// Every sensitive column name in the manifest (sensitive table baselines have no
// single column to key on; the leak risk is a named sensitive column as a key).
const sensitiveColumns: readonly string[] = [
  ...new Set(
    DATA_CLASSIFICATION.flatMap((t) =>
      (t.columns ?? [])
        .filter((c) => c.classification !== "operational_metadata")
        .map((c) => c.column)
    )
  ),
].sort();

const LOG_CALL_RE = /\b(?:log\.(?:info|warn|error)|startActionLog)\s*\(/g;

// Pull the balanced `(...)` argument text that follows a log call.
function callArgs(text: string, openParenIdx: number): string {
  let depth = 0;
  let arg = "";
  for (let i = openParenIdx; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") {
      depth++;
      if (depth === 1) continue;
    } else if (ch === ")") {
      depth--;
      if (depth === 0) return arg;
    }
    if (depth >= 1) arg += ch;
  }
  return arg;
}

const RUNTIME = readSourceFiles({
  roots: ["app", "lib", "components"],
  extensions: [".ts", ".tsx"],
  exclude: ["/__tests__/", ".test.ts", ".test.tsx"],
});

describe("fitness: structured logs never key on a sensitive column", () => {
  it("scans a non-trivial number of runtime files and log calls (sanity)", () => {
    const withLogs = RUNTIME.filter((f) =>
      /\blog\.(info|warn|error)\s*\(/.test(f.text)
    );
    expect(RUNTIME.length).toBeGreaterThan(50);
    expect(withLogs.length).toBeGreaterThan(5);
  });

  it("no log/startActionLog context object uses a sensitive column as a key", () => {
    const offenders: string[] = [];
    for (const file of RUNTIME) {
      // Strip comments AND strings: object KEYS are bare identifiers here, so a
      // sensitive word inside a value string ("enter email:") can't false-trip.
      const code = stripCommentsAndStrings(file.text);
      LOG_CALL_RE.lastIndex = 0;
      for (let m = LOG_CALL_RE.exec(code); m; m = LOG_CALL_RE.exec(code)) {
        const open = code.indexOf("(", m.index);
        const args = callArgs(code, open);
        for (const col of sensitiveColumns) {
          // `<col>` in object-key position: preceded by `{` or `,`, followed by `:`.
          if (new RegExp(`[{,]\\s*${col}\\s*:`).test(args)) {
            offenders.push(`  ${file.relPath}  keys on "${col}"`);
          }
        }
      }
    }
    expect(
      offenders,
      offenders.length === 0
        ? ""
        : `Logs must not carry raw sensitive fields (hash/redact or record ` +
            `presence instead):\n${[...new Set(offenders)].join("\n")}`
    ).toEqual([]);
  });
});
