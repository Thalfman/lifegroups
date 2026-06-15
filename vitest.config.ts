import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": rootDir,
      // `server-only` is Next's build-time client/server marker; it is not a
      // real installable module here, so stub it to an empty module for tests
      // that import server-only read layers (e.g. group-health-read).
      "server-only": fileURLToPath(
        new URL("./tests/stubs/server-only.ts", import.meta.url)
      ),
    },
  },
  // Match Next.js: components use the automatic JSX runtime (no `import React`
  // in scope), so the test transform must too — otherwise rendering a component
  // to static markup throws "React is not defined".
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "node",
    include: ["**/__tests__/**/*.test.ts", "**/*.test.ts", "**/*.test.tsx"],
    exclude: [
      "node_modules/**",
      ".next/**",
      "supabase/functions/**",
      "dist/**",
      // Ephemeral agent git worktrees live under `.claude/worktrees/**` and
      // carry their own (possibly mid-refactor) copies of the test files.
      // Scanning them double-runs the suite and surfaces unrelated failures
      // from in-progress work, so keep the runner to the real tree.
      "**/.claude/**",
      // The RLS / action-pipeline integration harness (issue #607) needs a live
      // local Supabase CLI stack + seeded auth, so it is OPT-IN / SCHEDULED and
      // lives off this deterministic default lane. It runs under its own runner
      // (`vitest.integration.config.ts` / `npm run test:integration`); excluding
      // it here keeps `npm run test:run` green with no stack or credentials.
      "tests/integration/**",
    ],
    // Coverage is opt-in (`npm run test:coverage`) and intentionally
    // **non-blocking** — no thresholds gate CI. It exists only to surface
    // coverage gaps; enforcing a floor is a deliberate later decision.
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["app/**", "components/**", "lib/**", "proxy.ts"],
      exclude: [
        "**/__tests__/**",
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/*.d.ts",
        "tests/**",
        "types/**",
      ],
    },
  },
});
