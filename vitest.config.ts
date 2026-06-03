import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": rootDir,
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
