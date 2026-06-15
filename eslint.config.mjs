import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import jsxA11y from "eslint-plugin-jsx-a11y";

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
  // Catch a11y regressions (icon-only buttons without a label, missing alt
  // text, invalid ARIA, …) at author time, not just in the Playwright + axe
  // runtime suite. The flat-config recommended preset is scoped to the JSX/TSX
  // surfaces and runs as `error` so `npm run lint` stays at 0 warnings.
  {
    files: ["**/*.{jsx,tsx}"],
    plugins: { "jsx-a11y": jsxA11y },
    rules: jsxA11y.flatConfigs.recommended.rules,
  },
];

export default eslintConfig;
