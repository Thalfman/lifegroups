import { describe, expect, it } from "vitest";

import { readSourceFiles } from "./support/source-globber";

const EXPECTED_SUPABASE_CLI_VERSION = "2.109.1";
const SETUP_CLI_USE = /uses:\s*supabase\/setup-cli@v1/g;
const PINNED_SETUP_CLI =
  /uses:\s*supabase\/setup-cli@v1\s*\r?\n\s*with:\s*\r?\n\s*version:\s*([^\s#]+)/g;

const workflows = readSourceFiles({
  roots: [".github/workflows"],
  extensions: [".yml", ".yaml"],
});

describe("fitness: Supabase CLI is reproducibly pinned", () => {
  it("gives every setup-cli step an explicit numeric version", () => {
    const unpinned = workflows.flatMap((workflow) => {
      const setupCount = workflow.text.match(SETUP_CLI_USE)?.length ?? 0;
      const pinnedCount = [...workflow.text.matchAll(PINNED_SETUP_CLI)].length;
      return setupCount === pinnedCount ? [] : [workflow.relPath];
    });

    expect(
      unpinned,
      unpinned.length === 0
        ? ""
        : "Every supabase/setup-cli@v1 step must use `with.version`; " +
            `missing or malformed pins in:\n  ${unpinned.join("\n  ")}`
    ).toEqual([]);
  });

  it(`uses Supabase CLI ${EXPECTED_SUPABASE_CLI_VERSION} in every workflow`, () => {
    const installations = workflows.flatMap((workflow) =>
      [...workflow.text.matchAll(PINNED_SETUP_CLI)].map((match) => ({
        file: workflow.relPath,
        version: match[1],
      }))
    );

    expect(installations.length).toBeGreaterThan(0);
    expect(
      installations.filter(
        (installation) => installation.version !== EXPECTED_SUPABASE_CLI_VERSION
      ),
      "Upgrade the approved Supabase CLI version deliberately and keep every " +
        "verification workflow on the same numeric pin."
    ).toEqual([]);
  });
});
