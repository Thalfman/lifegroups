import { describe, expect, it } from "vitest";

import { DATA_CLASSIFICATION } from "@/lib/security/data-classification";
import { readSourceFiles, stripComments } from "./support/source-globber";

// Log-leak guard (issue #699). Structured log context (`LogContext` in
// lib/observability/logger.ts) is freeform (`[key: string]: unknown`), so there
// is no static field allowlist to assert against. Instead this guards the CALL
// SITES: no `log.{info,warn,error}(…)`, `startActionLog(…)`, or `ctx.finish(…)`
// (which spreads its `fields` into the logger, see lib/observability/instrument.ts)
// context may key on a sensitive column name — whether written as `{ email: x }`
// or in object shorthand `{ email }`. The repo already routes identity through
// `hashEmail()` (→ `email_hash`, not `email`) and records presence (`ip_present`,
// `has_*`); this codifies that so a future `{ email, note: … }` log fails.
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

// `log.{info,warn,error}(` direct calls, `startActionLog(`, and any `.finish(`
// (the action-log terminal call whose fields are spread into the logger).
const LOG_CALL_RE =
  /(?:\blog\.(?:info|warn|error)|\bstartActionLog|\.finish)\s*\(/g;

// Strip comments, then COLLAPSE every string/template body to empty while
// keeping the delimiters (`"missing"` → `""`). One self-consistent pass, so:
//   - a `, email:` inside a value string can't false-trip key detection, and
//   - a key's value still shows its first char (`"` ⇒ literal, letter ⇒ variable).
function prepSource(src: string): string {
  const noComments = stripComments(src); // also blanks regex literals
  let out = "";
  let mode: "code" | "'" | '"' | "`" = "code";
  for (let i = 0; i < noComments.length; i++) {
    const c = noComments[i];
    if (mode === "code") {
      if (c === "'" || c === '"' || c === "`") {
        out += c;
        mode = c;
      } else {
        out += c;
      }
    } else if (c === "\\") {
      i++; // skip the escaped char (body is collapsed anyway)
    } else if (c === mode) {
      out += c;
      mode = "code";
    } else if (c === "\n") {
      out += "\n"; // keep line structure
    }
  }
  return out;
}

// The [start, end) index range of the balanced `(...)` argument after a call.
function callArgRange(
  text: string,
  openParenIdx: number
): { start: number; end: number } {
  let depth = 0;
  for (let i = openParenIdx; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") {
      depth--;
      if (depth === 0) return { start: openParenIdx + 1, end: i };
    }
  }
  return { start: openParenIdx + 1, end: text.length };
}

// A literal VALUE (collapsed string / number / boolean / null) logged under a
// key is a safe constant label, not leaked data; a variable/member expression
// (or object shorthand, which is always a variable) is the leak.
function valueIsLiteral(code: string, valueIdx: number): boolean {
  const c = code[valueIdx] ?? "";
  if (c === '"' || c === "'" || c === "`") return true;
  if (/[0-9]/.test(c)) return true;
  return /^(?:true|false|null)\b/.test(code.slice(valueIdx, valueIdx + 5));
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

  it("no log context carries a sensitive column's value (key or shorthand)", () => {
    const offenders: string[] = [];
    for (const file of RUNTIME) {
      const code = prepSource(file.text);
      LOG_CALL_RE.lastIndex = 0;
      for (let m = LOG_CALL_RE.exec(code); m; m = LOG_CALL_RE.exec(code)) {
        const open = code.indexOf("(", m.index);
        const { start, end } = callArgRange(code, open);
        const region = code.slice(start, end);
        for (const col of sensitiveColumns) {
          // Explicit `<col>: <value>` — a leak only when the value is not a
          // literal constant (e.g. `email: rawEmail`, not `reason: "missing"`).
          const keyRe = new RegExp(`[{,]\\s*${col}\\s*:\\s*`, "g");
          for (let km = keyRe.exec(region); km; km = keyRe.exec(region)) {
            if (!valueIsLiteral(region, km.index + km[0].length)) {
              offenders.push(
                `  ${file.relPath}  logs "${col}" (value reference)`
              );
            }
          }
          // Object shorthand `{ …, <col> }` is always a variable → a leak.
          if (new RegExp(`[{,]\\s*${col}\\s*[,}]`).test(region)) {
            offenders.push(`  ${file.relPath}  logs "${col}" (shorthand)`);
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
