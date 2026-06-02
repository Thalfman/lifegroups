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
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
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
