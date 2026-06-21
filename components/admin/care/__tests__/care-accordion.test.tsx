import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CareAccordion } from "@/components/admin/care/care-accordion";
import type {
  CareAccordionLeader,
  CareAccordionPane,
} from "@/lib/admin/care-accordion";

// The canonical Care view. These tests cover the presentation the pure model
// (lib/admin/care-accordion) doesn't: the per-pane needs-attention roll-up that
// makes the collapsed-by-default accordion scannable, the per-Leader marker that
// points at which Leaders the roll-up counts, and the shared disclosure
// affordance markup.

function leader(
  overrides: Partial<CareAccordionLeader> &
    Pick<CareAccordionLeader, "profileId" | "fullName">
): CareAccordionLeader {
  return {
    groupNames: [],
    ledGroups: [],
    careStatus: null,
    needsAttention: false,
    lastContactAt: null,
    nextStepDue: null,
    leaderHealthGrade: null,
    notes: { transparency: "sealed", careNoteCount: 0, prayerCount: 0 },
    ...overrides,
  };
}

function pane(overrides: Partial<CareAccordionPane>): CareAccordionPane {
  return {
    overShepherdId: "os-1",
    overShepherdName: "Olive Shepherd",
    isUnassigned: false,
    leaders: [],
    ...overrides,
  };
}

const UNASSIGNED = pane({
  overShepherdId: null,
  overShepherdName: "Unassigned",
  isUnassigned: true,
});

describe("CareAccordion", () => {
  it("rolls up how many Leaders in a pane need attention", () => {
    const html = renderToStaticMarkup(
      <CareAccordion
        panes={[
          pane({
            leaders: [
              leader({
                profileId: "l1",
                fullName: "Flagged Fran",
                needsAttention: true,
              }),
              leader({ profileId: "l2", fullName: "Steady Sam" }),
            ],
          }),
          UNASSIGNED,
        ]}
      />
    );

    expect(html).toContain("1 needs attention");
    expect(html).toContain("2 shepherds");
  });

  it("stays quiet when no Leader in a pane needs attention", () => {
    const html = renderToStaticMarkup(
      <CareAccordion
        panes={[
          pane({
            leaders: [leader({ profileId: "l2", fullName: "Steady Sam" })],
          }),
          UNASSIGNED,
        ]}
      />
    );

    expect(html).not.toContain("need attention");
  });

  it("keeps a collapsed pane lazy: the roll-up renders but leader panels do not (#777 WS3)", () => {
    // Mount-on-first-open — a collapsed pane (the default) hydrates only its
    // summary roll-up, deferring the form-heavy leader panels until it is
    // opened in the browser. renderToStaticMarkup is the closed state, so the
    // per-pane roll-up is present while no leader body is.
    const html = renderToStaticMarkup(
      <CareAccordion
        panes={[
          pane({
            leaders: [
              leader({
                profileId: "l1",
                fullName: "Flagged Fran",
                needsAttention: true,
              }),
            ],
          }),
          UNASSIGNED,
        ]}
      />
    );

    // The roll-up that signals where the work is stays server-rendered.
    expect(html).toContain("1 needs attention");
    // The leader panel (its summary + body) is gated until the pane is opened.
    expect(html).not.toContain("Flagged Fran");
    expect(html).not.toContain("Open leader care");
  });

  it("renders the shared disclosure affordance on every pane", () => {
    const html = renderToStaticMarkup(
      <CareAccordion
        panes={[
          pane({
            leaders: [leader({ profileId: "l1", fullName: "Steady Sam" })],
          }),
          UNASSIGNED,
        ]}
      />
    );

    expect(html).toContain("lg-sac-summary");
    expect(html).toContain("lg-sac-chevron");
  });
});
