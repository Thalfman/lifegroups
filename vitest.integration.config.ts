import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

// Dedicated runner for the RLS / action-pipeline INTEGRATION harness (issue
// #607). This is the OPT-IN / SCHEDULED lane: it talks to a live local Supabase
// CLI stack (`supabase start`) seeded with one auth user per oversight tier, so
// it exercises REAL Row Level Security and the full SECURITY DEFINER write
// pipeline (Auth-issued JWTs that `auth.uid()` / `auth_is_admin()` depend on).
//
// It is intentionally OFF the deterministic default lane: the default runner
// (`vitest.config.ts`, run by `npm run test:run`) excludes `tests/integration/**`,
// and these specs SKIP cleanly when the stack / credentials are absent (see
// `tests/integration/support/env.ts`). The two runners never overlap.
export default defineConfig({
  resolve: {
    alias: {
      "@": rootDir,
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**", "dist/**"],
    // Fixtures share a single local database; running specs in one process
    // keeps provisioning/teardown ordering deterministic and avoids JWT/client
    // contention against the local Auth server.
    fileParallelism: false,
    // Provisioning a stack-backed fixture set (auth users, profiles, coverage,
    // notes) is slower than an in-memory unit test, so allow generous timeouts.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
