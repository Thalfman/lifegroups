import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": rootDir,
    },
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
