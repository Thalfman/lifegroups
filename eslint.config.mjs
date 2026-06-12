import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      ".agents/**",
      "coverage/**",
      "graphify-out/**",
      "node_modules/**",
      "playwright-report/**",
      "supabase/functions/**",
      "test-results/**",
    ],
  },
  ...compat.extends("next/core-web-vitals"),
];

export default eslintConfig;
