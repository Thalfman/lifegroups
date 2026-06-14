import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Production Edge-Function allowlist guard.
//
// The Supabase GitHub integration redeploys EVERY function declared in
// `supabase/config.toml` (not disabled) on each push to main — which is how the
// privileged, local/test-only `manage-test-auth-users` function silently
// returned to production on 2026-06-09. The committed guard is `enabled = false`
// on that block; both the blanket CLI deploy and the integration skip disabled
// functions. This test fails if that config ever drifts, so the regression is
// caught in CI instead of in production. See docs/runbooks/RELEASE.md.
//
// Parsing note: this is a deliberately tiny TOML reader (block headers +
// `enabled = false`), not a full TOML parser — no new dependency, and it only
// needs to understand `[functions.*]` sections.

const PRODUCTION_FUNCTIONS = ["invite-user", "redeem-invite"];

const CONFIG_PATH = fileURLToPath(
  new URL("../../../supabase/config.toml", import.meta.url)
);

type FunctionConfig = { name: string; enabled: boolean };

function parseFunctionConfigs(toml: string): FunctionConfig[] {
  const lines = toml.split(/\r?\n/);
  const configs: FunctionConfig[] = [];
  let current: FunctionConfig | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (line.length === 0) continue;

    const header = line.match(/^\[functions\.([^\]]+)\]$/);
    if (header) {
      current = { name: header[1], enabled: true }; // enabled defaults to true
      configs.push(current);
      continue;
    }

    if (line.startsWith("[")) {
      current = null; // left the functions section
      continue;
    }

    if (current) {
      const enabledMatch = line.match(/^enabled\s*=\s*(true|false)\b/);
      if (enabledMatch) current.enabled = enabledMatch[1] === "true";
    }
  }

  return configs;
}

describe("edge-function production allowlist", () => {
  const toml = readFileSync(CONFIG_PATH, "utf8");
  const configs = parseFunctionConfigs(toml);

  it("declares the manage-test-auth-users function as disabled", () => {
    const manageTestAuth = configs.find(
      (c) => c.name === "manage-test-auth-users"
    );

    expect(
      manageTestAuth,
      "manage-test-auth-users block must exist"
    ).toBeDefined();
    expect(manageTestAuth?.enabled).toBe(false);
  });

  it("keeps the production-deployed function set exactly invite-user + redeem-invite", () => {
    const deployed = configs
      .filter((c) => c.enabled)
      .map((c) => c.name)
      .sort();

    expect(deployed).toEqual([...PRODUCTION_FUNCTIONS].sort());
  });
});
