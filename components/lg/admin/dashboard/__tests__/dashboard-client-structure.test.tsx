import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardClient } from "../DashboardClient";
import { ADMIN_FALLBACK } from "@/lib/dashboard/fallback-data";

// Home de-crowding structural invariant (#326). Render DashboardClient to static
// markup (node env, no jsdom — the collapsible's persistence effects don't run
// during SSR, so it emits its default-open markup) and pin the four-section
// hierarchy so urgent work keeps leading and the deeper overview cards stay
// behind the collapsible — never surfaced above the urgent-work queue.
//
// These assertions key off section anchors (aria-labelledby ids) and the cards'
// own eyebrow labels rather than styling, so they stay robust to re-skins.

function render() {
  return renderToStaticMarkup(
    <DashboardClient data={ADMIN_FALLBACK} guestsLive={false} scopeId="p1" />
  );
}

// First index of a substring, asserting it is actually present so an absent
// marker fails loudly instead of comparing -1 positions.
function indexOf(html: string, marker: string): number {
  const at = html.indexOf(marker);
  expect(
    at,
    `expected markup to contain ${JSON.stringify(marker)}`
  ).toBeGreaterThanOrEqual(0);
  return at;
}

describe("DashboardClient structure (Home de-crowding, #326)", () => {
  it("orders the four sections: needs attention → this week → ministry snapshot → recent activity", () => {
    const html = render();

    const needsAttention = indexOf(html, 'id="home-needs-attention"');
    const thisWeek = indexOf(html, 'id="home-this-week"');
    const snapshot = indexOf(html, 'id="home-snapshot"');
    const recentActivity = indexOf(html, 'id="home-recent-activity"');

    expect(needsAttention).toBeLessThan(thisWeek);
    expect(thisWeek).toBeLessThan(snapshot);
    expect(snapshot).toBeLessThan(recentActivity);
  });

  it("leads with the urgent-work queue above the collapsible overview", () => {
    const html = render();

    const needsAttention = indexOf(html, 'aria-label="Top next actions"');
    const collapsible = indexOf(html, "<details");

    // The ranked next-actions queue must precede the disclosure that hides the
    // deeper overview cards — urgent work never sits below them.
    expect(needsAttention).toBeLessThan(collapsible);
  });

  it("keeps always-visible vital signs outside the collapsible overview", () => {
    const html = render();

    const vitalSigns = indexOf(html, 'id="exec-vital-signs"');
    const collapsible = indexOf(html, "<details");

    // Vital signs lead the Ministry snapshot and are never collapsed.
    expect(vitalSigns).toBeLessThan(collapsible);
  });

  it("nests every deeper overview card inside the collapsible <details>", () => {
    const html = render();

    const collapsibleOpen = indexOf(html, "<details");
    const collapsibleClose = indexOf(html, "</details>");
    expect(collapsibleClose).toBeGreaterThan(collapsibleOpen);

    // The five deeper cards, identified by labels that render exactly once in
    // the markup (so indexOf can't latch onto an unrelated earlier match). Each
    // must live between the <details> open and close tags.
    const deeperCardMarkers = [
      "Leader care", // LeaderCareOverviewCard (eyebrow)
      "Launch planning", // LaunchPlanningOverviewCard (eyebrow)
      "Health pulse", // HealthDistributionCard (title)
      "Pipeline funnel", // GuestPipelineFunnelCard (title)
      "Leader pipeline", // LeaderPipelineOverviewCard (title)
    ];

    for (const marker of deeperCardMarkers) {
      const at = indexOf(html, marker);
      expect(
        at,
        `expected ${JSON.stringify(marker)} to render inside the collapsible overview`
      ).toBeGreaterThan(collapsibleOpen);
      expect(
        at,
        `expected ${JSON.stringify(marker)} to render inside the collapsible overview`
      ).toBeLessThan(collapsibleClose);
    }
  });

  it("does not surface any deeper overview card above the urgent-work queue", () => {
    const html = render();

    const needsAttention = indexOf(html, 'aria-label="Top next actions"');

    for (const marker of ["Leader care", "Launch planning", "Health pulse"]) {
      expect(
        indexOf(html, marker),
        `expected ${JSON.stringify(marker)} to render below the urgent-work queue`
      ).toBeGreaterThan(needsAttention);
    }
  });

  // Care/Plan/Multiply pivot (ADR 0016, #372): Home must not present stats for a
  // tab the operator retired. When Planning / People are hidden, their snapshot
  // cards drop with the tab; the Care-owned cards stay.
  it("drops the launch-planning and leader-pipeline cards when their tab is hidden", () => {
    const html = renderToStaticMarkup(
      <DashboardClient
        data={ADMIN_FALLBACK}
        guestsLive={false}
        scopeId="p1"
        hiddenNavAreas={["/admin/planning", "/admin/people"]}
      />
    );

    expect(html).not.toContain("Launch planning"); // LaunchPlanningOverviewCard
    expect(html).not.toContain("Leader pipeline"); // LeaderPipelineOverviewCard

    // Care-owned snapshot cards (and the frozen-gated guest funnel) stay.
    expect(html).toContain("Leader care"); // LeaderCareOverviewCard
    expect(html).toContain("Health pulse"); // HealthDistributionCard
    expect(html).toContain("Pipeline funnel"); // GuestPipelineFunnelCard
  });

  // Home-link hygiene (ADR 0016): with the default hidden set (Groups, People,
  // Planning hidden), no visible link may point at a retired/off-nav surface.
  // The Groups-bound attention rows drop out, the launch-planning links are gone
  // with the Planning-gated card and the now-removed "This week" milestone, and
  // group-health re-points to the active Care area.
  it("renders no links to hidden or off-nav surfaces under the default hidden set", () => {
    const html = renderToStaticMarkup(
      <DashboardClient
        data={ADMIN_FALLBACK}
        guestsLive={false}
        scopeId="p1"
        hiddenNavAreas={["/admin/groups", "/admin/people", "/admin/planning"]}
      />
    );

    expect(html).not.toContain("/admin/groups");
    expect(html).not.toContain("/admin/launch-planning");
    expect(html).not.toContain("/admin/group-health");
    expect(html).not.toContain("View planning");
    // The Care-owned health link lands on the active area instead.
    expect(html).toContain("/admin/care");
  });
});
