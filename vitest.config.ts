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
    ],
  },
});
