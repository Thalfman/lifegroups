import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { UsageWorkspace } from "@/components/admin/super-admin/usage-workspace";
import { buildNoClientConsoleData } from "@/components/admin/super-admin/console-data";

// #899 (Codex follow-up): a failed usage read must render an error-only body.
// The first cut kept the alert but still rendered UsagePanelShell below it,
// whose "Tracking is on. No activity has been recorded yet" empty state
// reintroduced the very false-quiet signal the alert exists to prevent.

// buildNoClientConsoleData carries a set usageEventsError; clearing it (with
// empty events) yields the genuinely-quiet baseline.
function healthyEmptyData() {
  return { ...buildNoClientConsoleData(), usageEventsError: null };
}

describe("UsageWorkspace failed-read rendering", () => {
  it("replaces the panel body with the alert when the usage read failed", () => {
    const html = renderToStaticMarkup(
      <UsageWorkspace data={buildNoClientConsoleData()} />
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("activity log is unavailable");
    // Neither quiet empty state may render below the alert.
    expect(html).not.toContain("No activity has been recorded yet");
    expect(html).not.toContain("nothing has been recorded");
  });

  it("keeps the shell's genuine empty state when the read succeeded", () => {
    const html = renderToStaticMarkup(
      <UsageWorkspace data={healthyEmptyData()} />
    );
    expect(html).not.toContain('role="alert"');
    // Tracking is off in the built-in config, so the tracking-off quiet state
    // is the genuine fact to show.
    expect(html).toContain("nothing has been recorded");
  });
});
