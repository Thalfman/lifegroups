import { describe, expect, it } from "vitest";

import { readSourceFiles } from "./support/source-globber";
import { formatMatches, scanLines } from "./support/scan";

const LIB_TYPESCRIPT = readSourceFiles({
  roots: ["lib"],
  extensions: [".ts"],
});

const TEST_AUTH_EDGE_FUNCTION = readSourceFiles({
  roots: ["supabase/functions/manage-test-auth-users/index.ts"],
  extensions: [".ts"],
});

describe("fitness: pinned RPC and row trust boundaries stay typed", () => {
  it("lib TypeScript contains no bottom-type assertion escape hatch", () => {
    const hits = scanLines(LIB_TYPESCRIPT, /\bas\s+never\b/);
    expect(
      hits,
      hits.length === 0
        ? ""
        : "Replace bottom-type assertions with a pinned registry or an " +
            `explicit typed fixture boundary:\n${formatMatches(hits)}`
    ).toEqual([]);
  });

  it("the test-auth Edge Function has no row access asserted to any", () => {
    const hits = scanLines(TEST_AUTH_EDGE_FUNCTION, /\bas\s+any\b/);
    expect(
      hits,
      hits.length === 0
        ? ""
        : "Declare the selected row shape instead of asserting it to any:\n" +
            formatMatches(hits)
    ).toEqual([]);
  });
});
