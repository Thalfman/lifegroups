import { describe, expect, it } from "vitest";

import { readSourceFiles } from "./support/source-globber";

const AGENT_DOCS = ["AGENTS.md", "CLAUDE.md"] as const;

const docs = readSourceFiles({
  roots: AGENT_DOCS,
  extensions: [".md"],
});

const HARDCODED_CHECK_COUNT =
  /\b\d+\s+(?:top-level\s+)?(?:fitness\s+)?(?:checks|invariants)\b/i;

describe("fitness: agent docs do not hard-code the suite size", () => {
  it("finds both agent instruction documents", () => {
    expect(docs.map((doc) => doc.relPath).sort()).toEqual(
      [...AGENT_DOCS].sort()
    );
  });

  it("describes enumerated invariants without a volatile numeric count", () => {
    const offenders = docs
      .filter((doc) => HARDCODED_CHECK_COUNT.test(doc.text))
      .map((doc) => doc.relPath);

    expect(
      offenders,
      "The top-level tests/fitness/*.test.ts files are the executable inventory. " +
        "Describe important invariants, but do not copy their changing count " +
        "into agent documentation."
    ).toEqual([]);
  });
});
