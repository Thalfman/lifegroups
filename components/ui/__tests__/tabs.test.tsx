import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Tabs } from "@/components/ui/tabs";

const TABS = [
  { id: "thresholds", label: "Thresholds", panel: <p>Metric defaults</p> },
  { id: "rubric", label: "Rubric", panel: <p>Health rubric</p> },
];

describe("Tabs", () => {
  it("renders the ARIA tabs pattern with namespaced ids", () => {
    const html = renderToStaticMarkup(
      <Tabs
        tabs={TABS}
        defaultTabId="thresholds"
        idPrefix="settings"
        ariaLabel="Settings sections"
      />
    );

    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Settings sections"');
    expect(html).toContain('role="tab"');
    expect(html).toContain('id="settings-tab-thresholds"');
    expect(html).toContain('aria-controls="settings-panel-thresholds"');
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('id="settings-panel-thresholds"');
  });

  it("mounts only the active panel and marks its tab selected", () => {
    const html = renderToStaticMarkup(
      <Tabs
        tabs={TABS}
        defaultTabId="thresholds"
        idPrefix="settings"
        ariaLabel="Settings sections"
      />
    );

    // Active panel is the only one rendered.
    expect(html).toContain("Metric defaults");
    expect(html).not.toContain("Health rubric");
    expect(html).toContain('aria-selected="true"');
  });

  it("falls back to the first tab when defaultTabId is absent or unknown", () => {
    const html = renderToStaticMarkup(
      <Tabs tabs={TABS} idPrefix="settings" ariaLabel="Settings sections" />
    );
    expect(html).toContain("Metric defaults");
  });
});
