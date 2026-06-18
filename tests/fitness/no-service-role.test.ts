import { describe, expect, it } from "vitest";

import { readSourceFiles, stripComments } from "./support/source-globber";
import {
  formatMatches,
  scanLines,
  stripFiles,
  TEST_FILE_EXCLUDES,
} from "./support/scan";

// P0 invariant (AGENTS.md / CLAUDE.md): NO service-role key in Next runtime
// code. The service role is confined to Supabase Edge Functions
// (`supabase/functions/**`) and harness-only test support
// (`tests/integration/support/**`) — never the runtime tree.
//
// This is a pure static scan over comment-stripped source: documentation
// ("never use the service role here") and test/migration assertions ("must NOT
// grant to service_role") live in comments or test files and are excluded, so
// only a real code reference trips it.

const RUNTIME = stripFiles(
  readSourceFiles({
    roots: ["app", "lib", "components", "proxy.ts"],
    extensions: [".ts", ".tsx"],
    exclude: [...TEST_FILE_EXCLUDES],
  }),
  stripComments
);

// The service-role key surfaces as the env identifier `SUPABASE_SERVICE_ROLE_KEY`
// (property access) or a `serviceRole` client option.
const SERVICE_ROLE = /SERVICE_ROLE_KEY|serviceRoleKey|service_role/;

describe("fitness: no service-role key in Next runtime code", () => {
  it("the runtime tree never references the service-role key", () => {
    const hits = scanLines(RUNTIME, SERVICE_ROLE);
    expect(
      hits,
      hits.length === 0
        ? ""
        : `Service-role usage is confined to supabase/functions/** and ` +
            `tests/integration/support/**. Found in runtime code:\n${formatMatches(hits)}`
    ).toEqual([]);
  });
});
