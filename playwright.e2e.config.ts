import { defineConfig, devices } from "@playwright/test";

// E2E happy-path lane (#812). Unlike playwright.config.ts (the a11y lane,
// which bakes NEXT_PUBLIC_A11Y_HARNESS=1 into the build and stubs every server
// action), this config serves the REAL app against a LOCAL seeded Supabase
// stack: real sign-in, real Server Actions, real SECURITY DEFINER RPCs, real
// RLS. A separate config because webServer build-time env is per-config — this
// build must NOT enable the harness, and must inline the NEXT_PUBLIC_SUPABASE_*
// values scripts/e2e.sh exports (see the sourced scripts/seeded-local-stack.sh).
//
// Run via `npm run test:e2e` (one command: starts the stack if needed, seeds,
// serves, runs). The specs do real writes against one shared local database,
// so the lane is single-worker with no parallelism; specs use unique note
// bodies so re-runs against a persistent local stack stay green.

const PORT = Number(process.env.E2E_PORT ?? 3211);
const BASE_URL = `http://127.0.0.1:${PORT}`;

// In CI we build once and serve the production output; locally `next dev` is
// faster to iterate against. Override with E2E_WEBSERVER if needed (mirrors
// A11Y_WEBSERVER). Unlike the a11y lane there is no build-time harness flag to
// protect here — but keep the build inside this command anyway so the
// NEXT_PUBLIC_SUPABASE_* values exported by scripts/e2e.sh are inlined into
// the same build Playwright serves.
const webServerCommand =
  process.env.E2E_WEBSERVER ??
  (process.env.CI
    ? `npm run build && npx next start -p ${PORT}`
    : `npx next dev -p ${PORT}`);

export default defineConfig({
  testDir: "./tests/e2e",
  // Playwright's default testMatch also catches *.test.ts, which would load
  // the Vitest unit tests colocated under tests/e2e/__tests__/ (they cover
  // the pure action-telemetry module) and fail on the vitest import. This
  // lane's specs are *.spec.ts only.
  testMatch: "**/*.spec.ts",
  // Real writes to one shared local database: keep the specs strictly serial.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Each spec crosses several full page loads of force-dynamic surfaces on a
  // cold `next start` against the local stack; a busy CI runner has blown the
  // default 30s budget on a single navigation. Generous is cheap here — the
  // lane is advisory, single-worker, and a handful of specs long (Care Note,
  // Interest Funnel, Multiply readiness). 120s so a spec that hits two
  // worst-case (~30s) write round-trips plus reloads still fits.
  timeout: 120_000,
  reporter: process.env.CI
    ? [
        ["list"],
        ["html", { outputFolder: "playwright-report-e2e", open: "never" }],
      ]
    : [["html", { outputFolder: "playwright-report-e2e" }]],
  expect: {
    // A submit's response carries the revalidated RSC payload for every
    // revalidated path, rebuilt while the runner also hosts the whole
    // Supabase container stack. The 2026-07-03 lane runs caught submits
    // still pending ("Saving…") 15s after the click — each time a different
    // spec, each passing on other runs — so 15s was inside the runner's
    // normal jitter for a write round-trip. 30s clears it with margin.
    timeout: 30_000,
  },
  use: {
    baseURL: BASE_URL,
    // retries stay 0, so capture the trace whenever a spec fails — it is the
    // main debugging artifact when the lane runs remotely in CI.
    trace: "retain-on-failure",
  },
  projects: [
    // One desktop project. The mobile-viewport matrix belongs to the a11y
    // lane; this lane pins the write pipeline, not responsive layout.
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: webServerCommand,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    // Forward the app server's output into the runner's stdout/stderr (#839):
    // the read loaders' `read_bundle` structured log lines (and any server
    // errors) then land in the CI job log, timestamped, interleaved with the
    // specs' [e2e] server-action telemetry — so a stalled write can be
    // correlated with what the re-rendered page's reads were doing. Playwright
    // defaults stdout to "ignore"; the build output rides along, which is
    // acceptable noise for an advisory diagnostics lane.
    stdout: "pipe",
    stderr: "pipe",
    // Deliberately NO env block: the command inherits the shell environment
    // (the Supabase env exported by scripts/e2e.sh), and
    // NEXT_PUBLIC_A11Y_HARNESS stays unset — real routes only. The
    // service-role key is never exported by the runner, so it cannot reach
    // this server (repo invariant).
  },
});
