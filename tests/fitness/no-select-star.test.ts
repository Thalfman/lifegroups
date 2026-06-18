import { describe, expect, it } from "vitest";

import { readSourceFiles } from "./support/source-globber";
import { formatMatches, scanLines, TEST_FILE_EXCLUDES } from "./support/scan";

// P0 invariant: every table read uses explicit column allowlists, never
// `select("*")`. The read seam selects named columns everywhere (e.g.
// SESSION_PROFILE_COLUMNS). This scan keeps that satisfied invariant green.

const RUNTIME = readSourceFiles({
  roots: ["app", "lib", "components", "proxy.ts"],
  extensions: [".ts", ".tsx"],
  exclude: [...TEST_FILE_EXCLUDES],
});

// `.select("*")` or `.select('*')`, tolerating whitespace inside the call.
const SELECT_STAR = /\.select\(\s*(['"])\*\1\s*\)/;

describe('fitness: no select("*") in runtime code', () => {
  it("app/**, lib/**, components/** never select('*')", () => {
    const hits = scanLines(RUNTIME, SELECT_STAR);
    expect(
      hits,
      hits.length === 0
        ? ""
        : `Reads must use explicit column allowlists, not select("*"):\n${formatMatches(hits)}`
    ).toEqual([]);
  });
});
