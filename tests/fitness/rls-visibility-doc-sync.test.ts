import { describe, expect, it } from "vitest";

import { MATRIX } from "@/lib/admin/__tests__/rls-visibility-matrix";
import { readSourceFiles } from "./support/source-globber";

// RLS visibility doc-sync check (issue #813 / audit finding SEC-1). The
// human-readable spec (docs/architecture/RLS_VISIBILITY.md) is the source of
// truth reviewers reason from, but it is hand-maintained and has lagged the
// enforced matrix before (it missed first_run_orientations and
// account_deletion_requests, and under-counted the table total). This check
// makes the doc unable to lag again: every table the sweep-test MATRIX
// classifies must be named in the doc, and the doc's header count must match
// the matrix. The doc's PROSE (which class each table is listed under) stays
// review-territory — this is a presence check, not a semantic parser.

const DOC_PATH = "docs/architecture/RLS_VISIBILITY.md";

const doc = readSourceFiles({
  roots: ["docs/architecture"],
  extensions: [".md"],
}).find((f) => f.relPath === DOC_PATH);

describe("fitness: RLS_VISIBILITY.md stays in sync with the enforced matrix", () => {
  it("finds the doc (sanity)", () => {
    expect(doc, `${DOC_PATH} should exist`).toBeDefined();
  });

  it("names every table classified by the sweep-test MATRIX", () => {
    const text = doc?.text ?? "";
    const missing = [...new Set(MATRIX.map((entry) => entry.table))]
      .sort()
      .filter((table) => !text.includes(table));
    expect(
      missing,
      missing.length === 0
        ? ""
        : `These MATRIX table(s) are classified by ` +
            `lib/admin/__tests__/rls-visibility-matrix.ts but never mentioned ` +
            `in ${DOC_PATH} — add each to its visibility-class section:\n` +
            missing.map((t) => `  ${t}`).join("\n")
    ).toEqual([]);
  });

  it("carries a header count that matches the matrix size", () => {
    const text = doc?.text ?? "";
    const match = text.match(/The matrix \((\d+) RLS-enabled tables\)/);
    expect(
      match,
      `${DOC_PATH} should have a "## The matrix (<n> RLS-enabled tables)" heading`
    ).not.toBeNull();
    const documented = Number(match?.[1]);
    const enforced = new Set(MATRIX.map((entry) => entry.table)).size;
    expect(
      documented,
      `${DOC_PATH} says ${documented} RLS-enabled tables but the enforced ` +
        `matrix classifies ${enforced} — update the heading (and the class ` +
        `lists) when the matrix changes`
    ).toBe(enforced);
  });
});
