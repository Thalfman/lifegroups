import { expect, test } from "@playwright/test";
import { gotoHarness, surface } from "./harness";

// Client-render performance baseline (repo "measure-first" perf work). The
// gated /a11y-harness route mounts the real heavy admin components
// (Readiness grid, Groups directory, People directory, Person detail, Home)
// with deterministic demo data and NO auth, so it is the one place we can
// measure their hydration + paint cost locally — the authed /admin routes are
// force-dynamic and redirect to /login without a Supabase stack.
//
// This is deliberately MEASUREMENT-ONLY: it attaches a JSON metrics artifact
// (Navigation Timing, first paint, main-thread long tasks, and per-surface DOM
// node counts) rather than asserting a threshold. A flaky timing gate would
// cost more than it catches; the artifact is the baseline a later change is
// compared against. It does NOT measure server read latency — that is a
// production signal (the `read_bundle` logs + Vercel SpeedInsights).
//
// Scope note: the harness mounts each surface standalone (e.g.
// `multiply-readiness-grid` is a bare `MultiplyGridView`, NOT wrapped in
// `MultiplyShell`), so this baseline captures each heavy component's own
// hydration/paint cost — it does NOT isolate the `/admin/multiply` lazy-mount
// win. That win is a server/initial-render reduction (inactive panels stop
// rendering + hydrating on the "plan" path), visible via `npm run analyze` and
// the production `read_bundle` lines, not in a standalone-surface harness.
//
// The only hard assertion is that the harness actually rendered, so a 404 or
// blank page (gate off) can't pass silently as "fast".

// The heaviest component trees on the harness, by render weight. Each must
// exist as a `data-a11y-surface` in app/a11y-harness/harness-client.tsx.
const HEAVY_SURFACES = [
  "multiply-readiness-grid",
  "groups-directory",
  "people",
  "person-detail",
  "home",
] as const;

type LongTaskWindow = Window & { __perfLongTasks?: number[] };

test("captures a client render/paint baseline for the harness surfaces", async ({
  page,
}, testInfo) => {
  // Install a long-task accumulator before any page script runs, so we capture
  // main-thread blocking during hydration (the cost lazy-mounting heavy panels
  // is meant to reduce). The API is Chromium-only; other engines just report 0.
  await page.addInitScript(() => {
    const store: number[] = [];
    (window as LongTaskWindow).__perfLongTasks = store;
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          store.push(Math.round(entry.duration));
        }
      });
      observer.observe({ type: "longtask", buffered: true });
    } catch {
      // long-task timing unsupported (non-Chromium) — the metric is omitted.
    }
  });

  await gotoHarness(page);
  // Let post-load hydration settle so the long-task accumulator is complete
  // before we read it (the harness has no further network activity).
  await page.waitForTimeout(500);

  const pageMetrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    const fcp = performance
      .getEntriesByType("paint")
      .find((entry) => entry.name === "first-contentful-paint");
    const longTasks = (window as LongTaskWindow).__perfLongTasks ?? [];
    return {
      domInteractive_ms: nav ? Math.round(nav.domInteractive) : null,
      domContentLoaded_ms: nav
        ? Math.round(nav.domContentLoadedEventEnd)
        : null,
      load_ms: nav ? Math.round(nav.loadEventEnd) : null,
      firstContentfulPaint_ms: fcp ? Math.round(fcp.startTime) : null,
      longTaskCount: longTasks.length,
      longTaskTotal_ms: longTasks.reduce((sum, ms) => sum + ms, 0),
      domNodes: document.getElementsByTagName("*").length,
    };
  });

  const surfaceMetrics: Record<string, { domNodes: number }> = {};
  for (const id of HEAVY_SURFACES) {
    const node = surface(page, id);
    if ((await node.count()) === 0) continue;
    surfaceMetrics[id] = {
      domNodes: await node.evaluate(
        (element) => element.getElementsByTagName("*").length
      ),
    };
  }

  const report = {
    capturedAt: new Date().toISOString(),
    project: testInfo.project.name,
    page: pageMetrics,
    surfaces: surfaceMetrics,
  };

  await testInfo.attach("perf-harness-metrics.json", {
    body: JSON.stringify(report, null, 2),
    contentType: "application/json",
  });

  // Measurement-only floor: prove the harness rendered something so a blank /
  // 404 page (gate off) can't pass as a fast baseline.
  expect(pageMetrics.domNodes).toBeGreaterThan(0);
});
