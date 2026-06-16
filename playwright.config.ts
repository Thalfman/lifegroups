import { defineConfig, devices } from "@playwright/test";

// Accessibility end-to-end checks (issue 257). The suite boots the app with
// the gated a11y harness route enabled and asserts, on real rendered admin
// surfaces, that repeated actions carry record context and that axe finds no
// critical/serious violations.
//
// Kept separate from the Vitest unit suite (`npm run test`) because it needs a
// browser + a running Next server. CI runs it as its own job.

const PORT = Number(process.env.A11Y_PORT ?? 3210);
const BASE_URL = `http://127.0.0.1:${PORT}`;

// In CI we build once and serve the production output; locally `next dev` is
// faster to iterate against. Override with A11Y_WEBSERVER if needed.
//
// IMPORTANT: keep `next build` INSIDE this command. NEXT_PUBLIC_A11Y_HARNESS
// is inlined at build time and the harness page's notFound() gate resolves
// statically, so the route is only a real 200 when the build sees
// webServer.env. Splitting the build into a separate step that lacks the env
// bakes /a11y-harness as a static 404 and every test fails the 200 guard.
const webServerCommand =
  process.env.A11Y_WEBSERVER ??
  (process.env.CI
    ? `npm run build && npx next start -p ${PORT}`
    : `npx next dev -p ${PORT}`);

export default defineConfig({
  testDir: "./tests/a11y",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "html",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    // Desktop a11y suite (everything except the mobile-only specs, which the
    // mobile-viewport projects below own).
    {
      name: "chromium",
      testIgnore: /mobile-(smoke|flows)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    // Mobile-viewport cross-surface smoke (#557) + the four priority-flow 375px
    // regression assertions (#651). Chromium-based at an iPhone-sized and an
    // Android-sized viewport. They run ONLY the mobile specs.
    {
      name: "mobile-iphone",
      testMatch: /mobile-(smoke|flows)\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "mobile-android",
      testMatch: /mobile-(smoke|flows)\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 412, height: 915 },
      },
    },
    // WebKit (Safari-engine) mobile project (#651) — the closest faithful proxy
    // to iPhone Safari, standing in for the unstaffed physical-device pass. The
    // iPhone 13 descriptor carries WebKit + `isMobile` (so the meta viewport and
    // `viewport-fit=cover` count) + `hasTouch`, and the viewport is pinned to the
    // 375px floor. CI installs `webkit` alongside `chromium`.
    {
      name: "mobile-webkit",
      testMatch: /mobile-flows\.spec\.ts/,
      use: {
        ...devices["iPhone 13"],
        viewport: { width: 375, height: 812 },
      },
    },
  ],
  webServer: {
    command: webServerCommand,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_A11Y_HARNESS: "1",
    },
  },
});
