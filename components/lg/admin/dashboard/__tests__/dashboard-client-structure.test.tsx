import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { DashboardClient } from "../DashboardClient";
import { MinistrySnapshotSection } from "../MinistrySnapshotSection";
import { RecentActivitySection } from "../RecentActivitySection";
import {
  ADMIN_FALLBACK,
  INTEREST_FUNNEL_FALLBACK,
  MULTIPLY_READINESS_FALLBACK,
  fallbackActivity,
} from "@/lib/dashboard/fallback-data";
import type {
  AdminDashboardData,
  InterestFunnelDashboardSummary,
  MultiplyReadinessDashboardSummary,
} from "@/lib/dashboard/types";

// Home de-crowding structural invariant (#326). Render DashboardClient to static
// markup (node env, no jsdom — the collapsible's persistence effects don't run
// during SSR, so it emits its default-open markup) and pin the four-section
// hierarchy so urgent work keeps leading and the deeper overview cards stay
// behind the collapsible — never surfaced above the urgent-work queue.
//
// These assertions key off section anchors (aria-labelledby ids) and the cards'
// own eyebrow labels rather than styling, so they stay robust to re-skins.

// #777 WS2: the snapshot body (vital-signs band + overview cards) is now passed
// to DashboardClient as `snapshotSlot` (the page streams it in its own Suspense
// boundary). The structure test renders it synchronously via the presentational
// MinistrySnapshotSection, so the `interestFunnel` / `multiplyReadiness`
// overrides still flow into the band + cards, and showLaunchPlanning /
// showLeaderPipeline are derived from `hiddenNavAreas` exactly as the page does.
type RenderOverrides = Partial<
  Omit<ComponentProps<typeof DashboardClient>, "snapshotSlot" | "activitySlot">
> & {
  interestFunnel?: InterestFunnelDashboardSummary;
  multiplyReadiness?: MultiplyReadinessDashboardSummary;
  // guestsLive / canResetActivity feed the streamed snapshot + activity slots
  // (no longer DashboardClient props), so they are declared here explicitly.
  guestsLive?: boolean;
  canResetActivity?: boolean;
};

function render(over: RenderOverrides = {}) {
  const {
    interestFunnel = INTEREST_FUNNEL_FALLBACK,
    multiplyReadiness = MULTIPLY_READINESS_FALLBACK,
    data = ADMIN_FALLBACK,
    guestsLive = false,
    canResetActivity = false,
    scopeId = "p1",
    hiddenNavAreas,
    degraded,
    ...rest
  } = over;
  const hidden = new Set(hiddenNavAreas ?? []);
  return renderToStaticMarkup(
    <DashboardClient
      data={data}
      scopeId={scopeId}
      hiddenNavAreas={hiddenNavAreas}
      degraded={degraded}
      {...rest}
      snapshotSlot={
        <MinistrySnapshotSection
          data={data}
          interestFunnel={interestFunnel}
          multiplyReadiness={multiplyReadiness}
          showLaunchPlanning={!hidden.has("/admin/planning")}
          showLeaderPipeline={!hidden.has("/admin/people")}
          guestsLive={guestsLive}
          scopeId={scopeId}
          degraded={degraded}
        />
      }
      // The structure test renders the presentational section with demo activity
      // (the live app streams RecentActivityData here), mirroring snapshotSlot.
      activitySlot={
        <RecentActivitySection
          activity={fallbackActivity}
          guestsLive={guestsLive}
          canResetActivity={canResetActivity}
        />
      }
    />
  );
}

// ADR 0027: Home is a self-dismissing setup workspace. The demo ADMIN_FALLBACK
// still has open setup steps, so it renders in SETUP MODE (checklist leads, the
// needs-attention queue is suppressed). Tests that assert dashboard-mode queue
// ordering force every setup step complete so Home reverts to the queue.
const DASHBOARD_MODE_DATA: AdminDashboardData = {
  ...ADMIN_FALLBACK,
  setupGaps: {
    ...ADMIN_FALLBACK.setupGaps,
    counts: { noCapacity: 0, noLeader: 0, noMeetingDayTime: 0, noMembers: 0 },
  },
  healthSummary: {
    ...ADMIN_FALLBACK.healthSummary,
    counts: {
      ...ADMIN_FALLBACK.healthSummary.counts,
      not_assessed: 0,
      missing_required_ratings: 0,
    },
  },
  launchPlanning: {
    ...ADMIN_FALLBACK.launchPlanning,
    available: true,
    currentParticipants: 24,
  },
  shepherdCare: {
    ...ADMIN_FALLBACK.shepherdCare,
    available: true,
    totalActiveShepherds: 8,
  },
};

function renderDashboardMode(over: RenderOverrides = {}) {
  return render({ data: DASHBOARD_MODE_DATA, ...over });
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
    const html = renderDashboardMode();

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
      "Shepherd care", // LeaderCareOverviewCard (eyebrow)
      "Launch planning", // LaunchPlanningOverviewCard (eyebrow)
      "Health pulse", // HealthDistributionCard (title)
      "Interest Funnel", // InterestFunnelOverviewCard (title)
      "Multiplication readiness", // MultiplyOverviewCard (title)
      "Shepherd pipeline", // LeaderPipelineOverviewCard (title)
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
    const html = renderDashboardMode();

    const needsAttention = indexOf(html, 'aria-label="Top next actions"');

    for (const marker of ["Shepherd care", "Launch planning", "Health pulse"]) {
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
    expect(html).not.toContain("Shepherd pipeline"); // LeaderPipelineOverviewCard

    // Care/Plan/Multiply-owned snapshot cards stay.
    expect(html).toContain("Shepherd care"); // LeaderCareOverviewCard
    expect(html).toContain("Health pulse"); // HealthDistributionCard
    expect(html).toContain("Interest Funnel"); // InterestFunnelOverviewCard
    expect(html).toContain("Multiplication readiness"); // MultiplyOverviewCard
  });

  // Home-link hygiene (ADR 0016): with the default hidden set (Groups, People,
  // Planning hidden), the retired launch-planning and group-health surfaces stay
  // out of Home, and setup recovery does not reintroduce dead-end setup links.
  it("keeps retired off-nav links and setup recovery CTAs out", () => {
    const html = render({
      hiddenNavAreas: ["/admin/groups", "/admin/people", "/admin/planning"],
    });

    expect(html).not.toContain("/admin/launch-planning");
    expect(html).not.toContain("/admin/group-health");
    expect(html).not.toContain("View planning");
    // The Care-owned health link lands on the active area instead.
    expect(html).toContain("/admin/care");
    expect(html).not.toContain("Setup checklist");
    expect(html).not.toContain("/admin/groups?tab=needs_setup");
    expect(html).not.toContain("/admin/groups?tab=needs_health_check");
    expect(html).not.toContain("/admin/people");
    expect(html).not.toContain("/admin/super-admin#people-import");
  });
});

// ADR 0027 — Home is a self-dismissing setup workspace. While any first-run
// setup step is incomplete, Home leads with the setup checklist and suppresses
// the needs-attention queue; once every step is complete it reverts to the queue.
describe("Home setup workspace (ADR 0027, #646)", () => {
  it("leads with the setup checklist and suppresses the queue in setup mode", () => {
    const html = render(); // ADMIN_FALLBACK still has open setup steps.

    // The checklist leads.
    indexOf(html, "Setup checklist");
    indexOf(html, "Finish setting up");
    // The needs-attention queue is suppressed (its ranked list is the signal;
    // "Needs attention" as a stat label legitimately survives on a snapshot card).
    expect(html).not.toContain('aria-label="Top next actions"');
  });

  it("reverts to the needs-attention queue once every setup step is complete", () => {
    const html = renderDashboardMode();

    indexOf(html, 'aria-label="Top next actions"');
    // The setup checklist self-dismisses.
    expect(html).not.toContain("Setup checklist");
    expect(html).not.toContain("Finish setting up");
  });

  it("states one canonical setup-step count with no group-setup-gaps sub-clause", () => {
    const html = render();

    indexOf(html, "setup steps");
    expect(html).toContain("still need attention.");
    // The dropped sub-clause must not return.
    expect(html).not.toContain("group setup gaps");
    expect(html).not.toContain("launch steps");
  });

  it("keeps the queue when a setup read is unavailable but no step is actionable", () => {
    // A live dashboard with one degraded per-card read: every actionable gap is
    // resolved, but launch-planning is unavailable so import/assign-members read
    // as "unavailable" (not "needs_action"). Home must stay in dashboard mode —
    // an unreadable setup step must not hide the operational queue.
    const html = renderDashboardMode({
      data: {
        ...DASHBOARD_MODE_DATA,
        launchPlanning: {
          ...DASHBOARD_MODE_DATA.launchPlanning,
          available: false,
        },
      },
    });

    indexOf(html, 'aria-label="Top next actions"');
    expect(html).not.toContain("Finish setting up");
  });

  it("does not enter setup mode on degraded fallback data", () => {
    // Degraded: the checklist hides itself, so Home stays in dashboard mode and
    // renders the needs-attention area (which, when degraded, shows its
    // all-clear line rather than a queue) — never the setup checklist.
    const html = render({ degraded: true });
    expect(html).not.toContain("Setup checklist");
    expect(html).not.toContain("Finish setting up");
    indexOf(html, "Nothing needs your attention right now.");
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
    // headline both derive from the typed seeds, not zeros. ("Groups ready<"
    // pins the card's own StatTile label, distinct from the vital-signs
    // band's "Groups ready to multiply" title.)
    indexOf(html, "joined a group");
    indexOf(html, "Groups ready<");
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
    expect(html).not.toContain("No Prospects in the Interest Funnel yet");
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
    // Neither the "no group types" empty state nor a 0-of-0 readout may render.
    // (The "Groups ready<" needle is the card's StatTile label text node; the
    // vital-signs band's "Groups ready to multiply" title legitimately stays,
    // degraded to "—" by the same available:false.)
    expect(html).not.toContain("No active group types yet");
    expect(html).not.toContain("Groups ready<");
  });
});

// Empty-state tone pass (#480): when every read succeeded and every count is a
// TRUE zero, each card renders its empty state — and all of them speak in the
// same calm, pastoral voice as the queue's "Nothing needs your attention right
// now." anchor: a quiet present + what will gather there. Vocabulary follows
// CONTEXT.md — Prospects in the Interest Funnel, never guests/leads/pipeline.
const QUIET_DATA: AdminDashboardData = {
  ...ADMIN_FALLBACK,
  summary: { ...ADMIN_FALLBACK.summary, activeGroupCount: 0 },
  attentionItems: [],
  healthSummary: {
    submitted: [],
    missing: [],
    didNotMeet: [],
    plannedPause: [],
    needsFollowUp: [],
    watch: [],
    healthy: [],
    counts: {
      submitted: 0,
      missing: 0,
      did_not_meet: 0,
      planned_pause: 0,
      needs_follow_up: 0,
      watch: 0,
      healthy: 0,
      not_assessed: 0,
      missing_required_ratings: 0,
    },
  },
  setupGaps: {
    noCapacity: [],
    noLeader: [],
    noMeetingDayTime: [],
    noMembers: [],
    counts: { noCapacity: 0, noLeader: 0, noMeetingDayTime: 0, noMembers: 0 },
  },
  followUps: [],
  dueFollowUpsThisWeekCount: 0,
  shepherdCare: {
    ...ADMIN_FALLBACK.shepherdCare,
    needsAttention: 0,
    overdueTouchpoints: 0,
    notContactedRecently: 0,
    noCareProfile: 0,
    unassignedCoverage: 0,
    attentionItemsTotal: 0,
  },
  leaderPipeline: {
    counts: { identified: 0, in_training: 0, ready_to_lead: 0, launched: 0 },
    total: 0,
    available: true,
    error: null,
  },
  multiplication: {
    counts: { watching: 0, planned: 0, launched: 0, deferred: 0 },
    total: 0,
    available: true,
    error: null,
  },
};

const QUIET_FUNNEL: InterestFunnelDashboardSummary = {
  counts: { interested: 0, matched: 0, joined: 0, not_at_this_time: 0 },
  available: true,
  error: null,
};

const QUIET_READINESS: MultiplyReadinessDashboardSummary = {
  readyCells: 0,
  activeCells: 0,
  available: true,
  error: null,
};

const DEFAULT_HIDDEN = ["/admin/groups", "/admin/people", "/admin/planning"];

// The unified voice, one line per card. Pinned verbatim so a future card edit
// can't quietly drift back into mechanical "No X in the pipeline yet" phrasing.
const CALM_EMPTY_LINES = [
  "Nothing needs your attention right now.", // NeedsAttentionArea
  "The week ahead is clear — no follow-ups are due.", // ThisWeekCard
  "Care queue is clear.", // LeaderCareOverviewCard footer
  "No groups are meeting yet — the health pulse will gather here as groups begin.", // HealthDistributionCard
  "No Prospects in the Interest Funnel yet — new interest will gather here.", // InterestFunnelOverviewCard
  "No active group types yet — readiness will gather here once group types are set up in Settings.", // MultiplyOverviewCard
];

describe("Home empty-state tone pass (#480)", () => {
  function renderQuiet() {
    return render({
      data: QUIET_DATA,
      interestFunnel: QUIET_FUNNEL,
      multiplyReadiness: QUIET_READINESS,
      hiddenNavAreas: DEFAULT_HIDDEN,
    });
  }

  it("speaks in one calm pastoral voice when everything is quiet", () => {
    const html = renderQuiet();
    for (const line of CALM_EMPTY_LINES) indexOf(html, line);
  });

  it("never reverts to the retired mechanical phrasings", () => {
    const html = renderQuiet();
    for (const retired of [
      "No Prospects in the funnel yet.",
      "No active cells yet.",
      "No active groups yet.",
      "No guests in the pipeline yet.",
      "No apprentices in the pipeline yet.",
      "Nothing scheduled for the week ahead.",
      "Nothing else needs attention.",
    ]) {
      expect(html).not.toContain(retired);
    }
  });

  it("keeps guest/pipeline vocabulary off Home under the default flags", () => {
    // CONTEXT.md: Prospects move through the Interest Funnel — "guest" and
    // "pipeline" are retired words there. Under default flags (guests frozen,
    // Leader-pipeline tab hidden) neither word may surface anywhere on Home.
    const html = renderQuiet().toLowerCase();
    expect(html).not.toContain("guest");
    expect(html).not.toContain("pipeline");
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
    "Active shepherds",
    "Shepherds needing care",
    "Prospects in funnel",
    "Groups ready to multiply",
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
