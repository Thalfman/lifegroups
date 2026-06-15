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
  // eslint-config-next 16 bundles eslint-plugin-react-hooks v6, whose
  // recommended set adds `react-hooks/refs` (~82 hits: writing ref.current in
  // render). Adopting it is a behavioral React refactor across many components,
  // sliced after `set-state-in-effect` and tracked under #632; re-enable it
  // there. Every other react-hooks v6 rule (incl. set-state-in-effect) is on.
  {
    rules: {
      "react-hooks/refs": "off",
    },
  },
];

export default eslintConfig;
