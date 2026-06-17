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
  // Ban blocking native dialogs (#667). Every `window.confirm` / `alert` /
  // `prompt` call site has been migrated to the non-blocking confirmation
  // modal (#664–#666); `no-alert` locks that win in so a regression fails the
  // build. The core rule flags both the bare globals and the `window.` /
  // `globalThis.` member forms. A genuinely unavoidable exception must opt out
  // explicitly with an inline `// eslint-disable-next-line no-alert` plus a
  // justification — the default is banned.
  {
    rules: {
      "no-alert": "error",
    },
  },
];

export default eslintConfig;
