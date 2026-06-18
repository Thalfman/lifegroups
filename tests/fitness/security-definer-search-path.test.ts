import { describe, expect, it } from "vitest";

import { readSourceFiles } from "./support/source-globber";
import {
  effectiveFunctions,
  unpinnedSecurityDefiners,
} from "./support/sql-functions";

// P0 hardening invariant (issue #697): every `SECURITY DEFINER` function in
// `supabase/migrations/**` pins `search_path`. An unpinned definer runs with the
// caller's `search_path`, so a caller could shadow `public.<table>`/`<function>`
// with an object in another schema and redirect the privileged body — the
// `function_search_path_mutable` advisor class.
//
// This is checked PER FUNCTION SIGNATURE on the EFFECTIVE final state, not by
// per-file text counts (a raw grep over-counts: it sees `security definer` /
// `search_path` mentions inside comments and dollar-quoted bodies, and misses
// that a later CREATE OR REPLACE / ALTER pinned an earlier definition). The
// parser in `support/sql-functions.ts` reads only function headers and folds the
// migration history in filename order.

const MIGRATIONS = readSourceFiles({
  roots: ["supabase/migrations"],
  extensions: [".sql"],
});

describe("fitness: SECURITY DEFINER functions pin search_path", () => {
  it("finds migrations to scan (guards against a broken glob)", () => {
    expect(MIGRATIONS.length).toBeGreaterThan(0);
  });

  it("every SECURITY DEFINER function pins search_path (effective state)", () => {
    const flagged = unpinnedSecurityDefiners(MIGRATIONS);
    expect(
      flagged,
      flagged.length === 0
        ? ""
        : `These SECURITY DEFINER functions don't pin search_path. Pin each ` +
            `inline (\`set search_path = public, pg_temp\`) or add an additive ` +
            `\`alter function … set search_path …\` migration:\n` +
            flagged
              .map((f) => `  ${f.signature}  (last defined ${f.definedAt})`)
              .join("\n")
    ).toEqual([]);
  });

  it("actually inspects SECURITY DEFINER functions (sanity floor)", () => {
    // If the parser silently matched nothing, the check above would pass
    // vacuously. The write pipeline is built on SECURITY DEFINER RPCs, so there
    // must be a substantial number of them.
    const definers = effectiveFunctions(MIGRATIONS).filter(
      (f) => f.isSecurityDefiner
    );
    expect(definers.length).toBeGreaterThan(50);
  });
});
