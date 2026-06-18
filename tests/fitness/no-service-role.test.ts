import { describe, expect, it } from "vitest";

import { readSourceFiles } from "./support/source-globber";
import { formatMatches, scanLines, TEST_FILE_EXCLUDES } from "./support/scan";

// P0 invariant (AGENTS.md / CLAUDE.md): NO service-role key in Next runtime
// code. The service role is confined to Supabase Edge Functions
// (`supabase/functions/**`) and harness-only test support
// (`tests/integration/support/**`) — never `app/**` or `lib/**`.
//
// This is a pure static scan: it reads source text and asserts the
// service-role identifier never appears in runtime code. Comments and test
// files are excluded so documentation ("never use the service role here") and
// migration assertions ("must NOT grant to service_role") don't trip it.

const RUNTIME = readSourceFiles({
  roots: ["app", "lib", "proxy.ts"],
  extensions: [".ts", ".tsx"],
  exclude: [...TEST_FILE_EXCLUDES],
});

// The service-role key surfaces as the env identifier `SUPABASE_SERVICE_ROLE_KEY`
// (property access, survives string-stripping) or a `serviceRole` client option.
const SERVICE_ROLE = /SERVICE_ROLE_KEY|serviceRoleKey|service_role/;

describe("fitness: no service-role key in Next runtime code", () => {
  it("app/** and lib/** never reference the service-role key", () => {
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
