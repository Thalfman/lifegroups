import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { DashboardClient } from "../DashboardClient";
import {
  ADMIN_FALLBACK,
  INTEREST_FUNNEL_FALLBACK,
  MULTIPLY_READINESS_FALLBACK,
} from "@/lib/dashboard/fallback-data";

// Home de-crowding structural invariant (#326). Render DashboardClient to static
// markup (node env, no jsdom — the collapsible's persistence effects don't run
// during SSR, so it emits its default-open markup) and pin the four-section
// hierarchy so urgent work keeps leading and the deeper overview cards stay
// behind the collapsible — never surfaced above the urgent-work queue.
//
// These assertions key off section anchors (aria-labelledby ids) and the cards'
// own eyebrow labels rather than styling, so they stay robust to re-skins.

function render(over: Partial<ComponentProps<typeof DashboardClient>> = {}) {
  return renderToStaticMarkup(
    <DashboardClient
      data={ADMIN_FALLBACK}
      interestFunnel={INTEREST_FUNNEL_FALLBACK}
      multiplyReadiness={MULTIPLY_READINESS_FALLBACK}
      guestsLive={false}
      scopeId="p1"
      {...over}
    />
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

    // The six deeper cards, identified by labels that render exactly once in
    // the markup (so indexOf can't latch onto an unrelated earlier match). Each
    // must live between the <details> open and close tags.
    const deeperCardMarkers = [
      "Leader care", // LeaderCareOverviewCard (eyebrow)
      "Launch planning", // LaunchPlanningOverviewCard (eyebrow)
      "Health pulse", // HealthDistributionCard (title)
      "Interest Funnel", // InterestFunnelOverviewCard (title)
      "Multiplication readiness", // MultiplyOverviewCard (title)
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
  // cards drop with the tab; the Care/Plan/Multiply-owned cards stay.
  it("drops the launch-planning and leader-pipeline cards when their tab is hidden", () => {
    const html = render({
      hiddenNavAreas: ["/admin/planning", "/admin/people"],
    });

    expect(html).not.toContain("Launch planning"); // LaunchPlanningOverviewCard
    expect(html).not.toContain("Leader pipeline"); // LeaderPipelineOverviewCard

    // Care/Plan/Multiply-owned snapshot cards stay.
    expect(html).toContain("Leader care"); // LeaderCareOverviewCard
    expect(html).toContain("Health pulse"); // HealthDistributionCard
    expect(html).toContain("Interest Funnel"); // InterestFunnelOverviewCard
    expect(html).toContain("Multiplication readiness"); // MultiplyOverviewCard
  });

  // Home-link hygiene (ADR 0016): with the default hidden set (Groups, People,
  // Planning hidden), no visible link may point at a retired/off-nav surface.
  // The Groups-bound attention rows drop out, the launch-planning links are gone
  // with the Planning-gated card and the now-removed "This week" milestone, and
  // group-health re-points to the active Care area.
  it("renders no links to hidden or off-nav surfaces under the default hidden set", () => {
    const html = render({
      hiddenNavAreas: ["/admin/groups", "/admin/people", "/admin/planning"],
    });

    expect(html).not.toContain("/admin/groups");
    expect(html).not.toContain("/admin/launch-planning");
    expect(html).not.toContain("/admin/group-health");
    expect(html).not.toContain("View planning");
    // The Care-owned health link lands on the active area instead.
    expect(html).toContain("/admin/care");
  });
});

// The pivot overview cards (#470): with default flags Home's snapshot must show
// the two newest areas — the Interest Funnel (Plan) and Multiplication
// readiness (Multiply) — with drill-in links, while the legacy guests card
// stays gated behind its frozen-surface flag.
describe("DashboardClient pivot overview cards (#470)", () => {
  it("shows the Interest Funnel and Multiplication cards with their drill-in links by default", () => {
    const html = render();

    indexOf(html, "Interest Funnel");
    indexOf(html, 'href="/admin/plan"');
    indexOf(html, "Multiplication readiness");
    indexOf(html, 'href="/admin/multiply"');

    // Live demo counts render — the funnel's roll-up line and the readiness
    // headline both derive from the typed seeds, not zeros. ("Cells ready<"
    // pins the card's own StatTile label, distinct from the vital-signs
    // band's "Cells ready to multiply" title.)
    indexOf(html, "joined a group");
    indexOf(html, "Cells ready<");
  });

  it("renders the legacy guests card only when the guests frozen surface is live", () => {
    // Default (frozen): the Interest Funnel holds the slot; no guests card, no
    // frozen placeholder, no off-nav guests link.
    const frozen = render();
    expect(frozen).not.toContain("Pipeline funnel");
    expect(frozen).not.toContain("/admin/guests");

    // Re-enabled-and-verified: the live guests card returns alongside the
    // pivot cards.
    const live = render({ guestsLive: true });
    indexOf(live, "Pipeline funnel");
    indexOf(live, "/admin/guests");
    indexOf(live, "Interest Funnel");
    indexOf(live, "Multiplication readiness");
  });

  it("degrades a failed funnel read to an unavailable card — never a zero count", () => {
    const html = render({
      interestFunnel: {
        counts: { interested: 0, matched: 0, joined: 0, not_at_this_time: 0 },
        available: false,
        error: "fetchProspectStateCounts: boom",
      },
    });

    indexOf(html, "Funnel data unavailable");
    // The card must not present the failure as an empty-but-healthy funnel.
    expect(html).not.toContain("No Prospects in the funnel yet.");
    expect(html).not.toContain("0 in the funnel");
  });

  it("degrades a failed readiness read to an unavailable card — never a zero count", () => {
    const html = render({
      multiplyReadiness: {
        readyCells: 0,
        activeCells: 0,
        available: false,
        error: "grid read failed",
      },
    });

    indexOf(html, "Readiness data unavailable");
    // Neither the "no cells" empty state nor a 0-of-0 readout may render.
    // (The "Cells ready<" needle is the card's StatTile label text node; the
    // vital-signs band's "Cells ready to multiply" title legitimately stays,
    // degraded to "—" by the same available:false.)
    expect(html).not.toContain("No active cells yet.");
    expect(html).not.toContain("Cells ready<");
  });
});

// Vital signs on the pivot (#476): the band leads with the six Care/Plan/
// Multiply signals; the four retired launch-planning metrics ride the SAME
// Planning nav gate as the LaunchPlanningOverviewCard — hidden under the
// default flags, restored (not re-built) when the Super Admin re-shows
// Planning.
describe("DashboardClient vital signs band (#476)", () => {
  const PIVOT_TITLES = [
    "Active groups",
    "Active leaders",
    "Leaders needing care",
    "Prospects in funnel",
    "Cells ready to multiply",
    "Follow-ups due this week",
  ];
  const LAUNCH_TITLES = [
    "% of church in groups",
    "People in groups",
    "Capacity used",
    "Launch outlook",
  ];

  it("shows the six pivot metrics and no launch-planning metric under the default hidden set", () => {
    const html = render({
      hiddenNavAreas: ["/admin/groups", "/admin/people", "/admin/planning"],
    });

    for (const title of PIVOT_TITLES) indexOf(html, title);
    for (const title of LAUNCH_TITLES) expect(html).not.toContain(title);
  });

  it("restores the launch-planning metrics when the Planning nav is re-shown", () => {
    const html = render({
      hiddenNavAreas: ["/admin/groups", "/admin/people"],
    });

    for (const title of [...PIVOT_TITLES, ...LAUNCH_TITLES]) {
      indexOf(html, title);
    }
  });
});
