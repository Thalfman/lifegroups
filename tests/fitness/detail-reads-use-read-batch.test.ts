import { describe, expect, it } from "vitest";

import { readSourceFiles, stripComments } from "./support/source-globber";
import { stripFiles, TEST_FILE_EXCLUDES } from "./support/scan";

// Invariant (ADR 0015 — the readBatch seam): the detail read-orchestration
// modules (`*-detail-data.ts` read assemblers under components/admin) gather
// their fixed-shape reads through `readBatch` (`lib/supabase/read-batch.ts`),
// which is the ONE place that owns the gather-and-degrade rule. A surface
// composes its fail-closed precedence from the returned `errors` bag /
// `firstError` (declaration order = precedence) instead of re-spelling the rule
// inline as a hand-written `Boolean(a.error || b.error)` gate over a raw
// `Promise.all`.
//
// PRs #766 (Group detail) and #767 (Care detail) migrated the last two admin
// read surfaces off that hand-rolled idiom. This guard is the regression net so
// it cannot silently leak back.
//
// The carve-out — what this guard must NOT flag:
//   * The migrated good form composes from the batch errors bag, e.g.
//       Boolean(gradeBatch.errors.leaderRubric || gradeBatch.errors.leaderGrade)
//     The discriminator is the raw ReadResult field `.error` (singular) vs the
//     readBatch bag `.errors.` (plural). The regex anchors on `\.error\b`, which
//     matches `.error` / `.error?` / `.error)` but NOT `.errors` (there is no
//     word boundary between `r` and `s`), so a batch-composed gate is allowed.
//   * The Care detail surface deliberately keeps a DYNAMIC per-item
//     `Promise.all(list.map(...))` fan-out (the per-group grade read) — not a
//     `readBatch` case per ADR 0015. It gates with `if (res.error)`, never the
//     `Boolean(... || ...)` OR-gate shape, so the narrow pattern below leaves it
//     untouched. No path allowlist is needed; the pattern itself is the carve-out.

const DETAIL_DATA_FILES = stripFiles(
  readSourceFiles({
    roots: ["components/admin"],
    extensions: [".ts"],
    exclude: [...TEST_FILE_EXCLUDES],
  }).filter((f) => /-detail-data\.ts$/.test(f.relPath)),
  stripComments
);

// The banned hand-rolled degrade gate: `Boolean(...)` whose argument ORs two or
// more raw `.error` (singular) reads. No regex flags are needed — `[^)]` and
// `\s` already span newlines, so the multi-line
//   Boolean(
//     a.error || b.error
//   )
// form is covered. `\.error\b` excludes the `.errors.` batch bag (see carve-out).
const HAND_ROLLED_DEGRADE_GATE =
  /Boolean\(\s*[^)]*?\.error\b[^)]*?\|\|[^)]*?\.error\b[^)]*?\)/;

describe("fitness: detail read-orchestration stays on the readBatch seam", () => {
  it("found a representative set of detail read-assembler modules", () => {
    // Guard against a glob/path regression silently scanning nothing.
    expect(DETAIL_DATA_FILES.length).toBeGreaterThanOrEqual(2);
  });

  it("no detail read-assembler hand-rolls a Boolean(error || error) degrade gate", () => {
    const offenders = DETAIL_DATA_FILES.filter((f) =>
      HAND_ROLLED_DEGRADE_GATE.test(f.text)
    ).map((f) => f.relPath);

    expect(
      offenders,
      offenders.length === 0
        ? ""
        : `These detail read-assemblers re-spell the gather-and-degrade rule as ` +
            `a hand-rolled Boolean(a.error || b.error) gate over a raw ` +
            `Promise.all. Gather the fixed-shape reads through readBatch ` +
            `(@/lib/supabase/read-batch) and compose precedence from the batch ` +
            `errors / firstError bag instead (ADR 0015):\n${offenders
              .map((o) => `  ${o}`)
              .join("\n")}`
    ).toEqual([]);
  });

  it("the guard matches the banned idiom and spares the allowed forms", () => {
    // Banned: an OR-gate over raw singular `.error` reads (single- and multi-line).
    expect(HAND_ROLLED_DEGRADE_GATE.test("Boolean(a.error || b.error)")).toBe(
      true
    );
    expect(
      HAND_ROLLED_DEGRADE_GATE.test(
        "const failed = Boolean(\n  rubricRes.error || gradeRes.error\n);"
      )
    ).toBe(true);

    // Allowed: composed from the readBatch errors bag (`.errors.`, plural).
    expect(
      HAND_ROLLED_DEGRADE_GATE.test(
        "Boolean(batch.errors.leaderRubric || batch.errors.leaderGrade)"
      )
    ).toBe(false);

    // Allowed: the deliberate dynamic per-item fan-out gates with `if`, not OR.
    expect(
      HAND_ROLLED_DEGRADE_GATE.test("if (res.error) failedGroupIds.add(g.id);")
    ).toBe(false);
  });
});
