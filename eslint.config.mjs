import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import jsxA11y from "eslint-plugin-jsx-a11y";

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
  // Next 16 / eslint-config-next 16 ships a native flat config, so it is spread
  // directly instead of through the legacy `FlatCompat` shim (which the new
  // config breaks). This already registers the `jsx-a11y` plugin (with a few
  // rules at `warn`).
  ...nextCoreWebVitals,
  // Catch a11y regressions (icon-only buttons without a label, missing alt
  // text, invalid ARIA, …) at author time, not just in the Playwright + axe
  // runtime suite. We upgrade the full recommended preset to `error` on the
  // JSX/TSX surfaces so `npm run lint` stays at 0 warnings. The plugin is
  // already registered by `nextCoreWebVitals` above, so we only set rules here
  // (redefining the plugin would throw a flat-config "cannot redefine" error).
  {
    files: ["**/*.{jsx,tsx}"],
    rules: jsxA11y.flatConfigs.recommended.rules,
  },
];

export default eslintConfig;
