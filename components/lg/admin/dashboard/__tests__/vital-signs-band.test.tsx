import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { VitalSignsBand } from "../VitalSignsBand";
import {
  ADMIN_FALLBACK,
  INTEREST_FUNNEL_FALLBACK,
  MULTIPLY_READINESS_FALLBACK,
} from "@/lib/dashboard/fallback-data";

// Vital signs on the Care/Plan/Multiply pivot (#476, ADR 0016/0022). The band
// leads with six pivot signals; the four retired launch-planning metrics are
// frozen, not deleted — they render only when the Planning nav flag is
// re-shown (`showLaunchPlanning`). Every tile degrades to "—" when its read
// failed — never a false zero.

const PIVOT_TITLES = [
  "Active groups",
  "Active leaders",
  "Leaders needing care",
  "Prospects in funnel",
  "Cells ready to multiply",
  "Follow-ups due this week",
] as const;

const LAUNCH_TITLES = [
  "% of church in groups",
  "People in groups",
  "Capacity used",
  "Launch outlook",
] as const;

const ALL_TITLES = [...PIVOT_TITLES, ...LAUNCH_TITLES];

function render(over: Partial<ComponentProps<typeof VitalSignsBand>> = {}) {
  return renderToStaticMarkup(
    <VitalSignsBand
      data={ADMIN_FALLBACK}
      interestFunnel={INTEREST_FUNNEL_FALLBACK}
      multiplyReadiness={MULTIPLY_READINESS_FALLBACK}
      showLaunchPlanning={false}
      {...over}
    />
  );
}

// The markup slice belonging to one MetricCard: from its title to the next
// rendered title (or the end). Lets a test assert a tile's value/meta without
// latching onto a neighbouring card's content.
function cardSlice(html: string, title: string): string {
  const start = html.indexOf(title);
  expect(
    start,
    `expected the band to contain ${JSON.stringify(title)}`
  ).toBeGreaterThanOrEqual(0);
  let end = html.length;
  for (const other of ALL_TITLES) {
    if (other === title) continue;
    const at = html.indexOf(other);
    if (at > start && at < end) end = at;
  }
  return html.slice(start, end);
}

describe("VitalSignsBand pivot metrics (#476)", () => {
  it("shows the six pivot metrics with values from the demo seeds", () => {
    const html = render();

    // Active groups — from the derived demo summary (8 active groups).
    expect(cardSlice(html, "Active groups")).toContain(">8<");
    // Active leaders — shepherdCare.totalActiveShepherds.
    expect(cardSlice(html, "Active leaders")).toContain(">24<");
    // Leaders needing care — shepherdCare.needsAttention, of the active total.
    const needsCare = cardSlice(html, "Leaders needing care");
    expect(needsCare).toContain(">3<");
    expect(needsCare).toContain("of 24 active leaders");
    // Prospects in funnel — the three live states (5 + 3 + 2); Joined is the
    // roll-up meta, mirroring the Interest Funnel card's partition.
    const funnel = cardSlice(html, "Prospects in funnel");
    expect(funnel).toContain(">10<");
    expect(funnel).toContain("4 joined a group");
    // Cells ready to multiply — "X of Y" from the Multiply grid summary.
    const cells = cardSlice(html, "Cells ready to multiply");
    expect(cells).toContain(">2<");
    expect(cells).toContain("of 6 active cells");
    // Follow-ups due this week — the demo follow-ups are all undated, so the
    // demo count is a TRUE zero (the read succeeded), not a degraded one.
    expect(cardSlice(html, "Follow-ups due this week")).toContain(">0<");
  });

  it("renders no launch-planning metric while Planning is nav-hidden", () => {
    const html = render({ showLaunchPlanning: false });

    for (const title of LAUNCH_TITLES) {
      expect(html).not.toContain(title);
    }
    // The six pivot metrics still lead the band.
    for (const title of PIVOT_TITLES) {
      expect(html).toContain(title);
    }
  });

  it("restores the launch-planning metrics when Planning is re-shown", () => {
    const html = render({ showLaunchPlanning: true });

    for (const title of [...PIVOT_TITLES, ...LAUNCH_TITLES]) {
      expect(html).toContain(title);
    }
    // The frozen metrics come back with their demo figures intact — nothing
    // was deleted while they were hidden.
    expect(cardSlice(html, "% of church in groups")).toContain("53%");
    expect(cardSlice(html, "People in groups")).toContain(">58<");
  });

  it("degrades a failed funnel read to — never a zero", () => {
    const html = render({
      interestFunnel: {
        counts: { interested: 0, matched: 0, joined: 0, not_at_this_time: 0 },
        available: false,
        error: "fetchProspectStateCounts: boom",
      },
    });

    const funnel = cardSlice(html, "Prospects in funnel");
    expect(funnel).toContain("—");
    expect(funnel).toContain("Funnel data unavailable");
    expect(funnel).not.toContain(">0<");
  });

  it("degrades a failed readiness read to — never a zero", () => {
    const html = render({
      multiplyReadiness: {
        readyCells: 0,
        activeCells: 0,
        available: false,
        error: "grid read failed",
      },
    });

    const cells = cardSlice(html, "Cells ready to multiply");
    expect(cells).toContain("—");
    expect(cells).toContain("Readiness data unavailable");
    expect(cells).not.toContain(">0<");
  });

  it("degrades both care-backed tiles when the care read failed", () => {
    const html = render({
      data: {
        ...ADMIN_FALLBACK,
        shepherdCare: {
          ...ADMIN_FALLBACK.shepherdCare,
          available: false,
          error: "care directory unavailable",
        },
      },
    });

    for (const title of ["Active leaders", "Leaders needing care"]) {
      const slice = cardSlice(html, title);
      expect(slice).toContain("—");
      expect(slice).toContain("Care data unavailable");
      expect(slice).not.toContain(">0<");
    }
  });

  it("degrades the dashboard-derived tiles to — when the whole read degraded", () => {
    // degraded ⇒ `data` is demo fallback; the band must not present its demo
    // counts (8 groups, 24 leaders, …) as live figures.
    const html = render({ degraded: true, showLaunchPlanning: true });

    for (const title of [
      "Active groups",
      "Active leaders",
      "Leaders needing care",
      "Follow-ups due this week",
      // The frozen launch metrics degrade too rather than echoing demo data.
      "People in groups",
      "Launch outlook",
    ]) {
      expect(cardSlice(html, title)).toContain("—");
    }
    expect(cardSlice(html, "Active groups")).not.toContain(">8<");
    expect(cardSlice(html, "Active leaders")).not.toContain(">24<");
  });
});
