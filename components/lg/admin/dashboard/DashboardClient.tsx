import type { ReactNode } from "react";
import { PageBody } from "@/components/lg/PageHeader";
import type { AdminDashboardData } from "@/lib/dashboard/types";
import { NeedsAttentionArea } from "./NeedsAttentionArea";
import { SetupRecoveryChecklist } from "./SetupRecoveryChecklist";
import { buildSetupRecoveryChecklist } from "@/lib/dashboard/setup-recovery";
import { ThisWeekCard } from "./ThisWeekCard";
import { ActivityBand } from "./ActivityBand";
import { ActivityResetControl } from "./ActivityResetControl";
import { SuperAdminOnlyMark } from "@/components/admin/super-admin-only-badge";
import { PeriodSlicer } from "./PeriodSlicer";

// Home — the /admin triage page (#299). It answers "what needs my attention
// first?" by ranking urgent work above everything else, then stepping out to
// wider horizons in priority order:
//
//   1. Needs attention  — the ranked next-actions queue (care, group setup,
//      health, follow-ups), each row an imperative action with a direct link.
//   2. This week         — the near-term horizon: due follow-ups, launch
//      milestone. One action: View planning.
//   3. Ministry snapshot — point-in-time vital signs + the domain overview
//      cards (care, capacity, health, leader pipeline). Secondary metrics; kept
//      below the urgent work.
//   4. Recent activity   — METADATA ONLY (counts + period). Never note/summary
//      bodies — those stay on the guarded care surfaces (ADR 0002).
//
// Re-skinned warm (pastoral palette) so it meshes with the deep care / launch
// surfaces. See docs/PRODUCT_SURFACE_AUDIT_2026-05.md for the admin-OS rationale.

// Sections speak in the serif voice — plain sentence-case headings, no
// tracked-uppercase eyebrows (the page kicker is the one tracked voice).
function SectionHeading({
  children,
  srOnly = false,
}: {
  children: ReactNode;
  // Visually hidden when the section's single card already carries the label
  // (e.g. This week → "The week ahead") so the label isn't said twice.
  srOnly?: boolean;
}) {
  return (
    <div
      className={
        srOnly ? "sr-only" : "font-display text-xl font-medium text-ink"
      }
    >
      {children}
    </div>
  );
}

export function DashboardClient({
  data,
  snapshotSlot,
  guestsLive,
  degraded,
  scopeId,
  mutedKeys,
  canResetActivity,
  hiddenNavAreas,
  isSuperAdmin,
  fromSetup = false,
}: {
  data: AdminDashboardData;
  // The Ministry-snapshot body (vital-signs band + overview cards), streamed in
  // its own <Suspense> boundary by the page (#777 WS2) so the LCP-path content
  // above paints without waiting on the slow Prospect-count / Multiply-grid
  // reads. The non-page call sites (structure test, a11y harness) pass a
  // synchronously-rendered MinistrySnapshotSection instead.
  snapshotSlot: ReactNode;
  guestsLive: boolean;
  // True when the dashboard read failed and `data` is demo fallback.
  degraded?: boolean;
  // Signed-in profile id, scoping the collapsible-overview saved default (#292).
  scopeId?: string | null;
  // "Needs attention" category keys a Super Admin has muted (launch optics).
  mutedKeys?: string[];
  // activity-reset: true for a super_admin, gating the Recent-activity reset
  // control. The server action is hard-gated too; this only hides the affordance.
  canResetActivity?: boolean;
  // Top-level area hrefs hidden from nav (ADR 0016). Home must not present stats
  // for a tab the operator retired, so the Ministry-snapshot overview cards that
  // drill into a now-hidden surface are dropped here too (the Care/Plan/Multiply
  // pivot keeps Home coherent on day one, #372). Omitted ⇒ hide nothing.
  hiddenNavAreas?: readonly string[];
  isSuperAdmin?: boolean;
  // True when Home was reached via a setup deep-link's "← Back to setup" return
  // (/admin?from=setup): re-focus the next incomplete step (ADR 0027).
  fromSetup?: boolean;
}) {
  // ADR 0027: Home is a self-dismissing setup workspace. While there is real
  // first-run setup work to do it leads with the checklist and SUPPRESSES the
  // needs-attention queue; once that work is done it reverts to the normal
  // dashboard (needs-attention queue + snapshot). Degraded fallback data never
  // enters setup mode — the checklist hides itself there, so trust the queue.
  //
  // Gate on an ACTIONABLE gap (a `needs_action` step), not merely any
  // non-complete step: a single degraded per-card read marks its step
  // `unavailable` (status !== "complete"), and that must not flip Home into
  // setup mode and hide the operational queue while the rest of the dashboard
  // is live. The checklist still surfaces unavailable steps via its own `show`.
  const setupChecklist = buildSetupRecoveryChecklist(data, {
    isSuperAdmin,
    hiddenNavAreas,
  });
  const setupMode =
    !degraded &&
    setupChecklist.steps.some((step) => step.status === "needs_action");
  return (
    <PageBody>
      <div className="grid gap-8">
        {/* 1 — The lead panel. In setup mode (any first-run step incomplete)
            Home leads with the guided setup checklist and suppresses the
            needs-attention queue; once setup is complete it reverts to the
            ranked needs-attention queue (leader care, group setup, health
            checks, overdue follow-ups), each row a direct link. (ADR 0027) */}
        <section
          aria-labelledby="home-needs-attention"
          className="grid gap-2.5"
        >
          {setupMode ? (
            <>
              <SectionHeading>
                <span id="home-needs-attention">Finish setting up</span>
              </SectionHeading>
              <SetupRecoveryChecklist
                data={data}
                degraded={degraded}
                isSuperAdmin={isSuperAdmin}
                hiddenNavAreas={hiddenNavAreas}
                focusOnReturn={fromSetup}
              />
            </>
          ) : (
            <>
              <SectionHeading>
                <span id="home-needs-attention">Needs attention</span>
              </SectionHeading>
              <NeedsAttentionArea
                data={data}
                degraded={degraded}
                mutedKeys={mutedKeys}
                hiddenNavAreas={hiddenNavAreas}
              />
            </>
          )}
        </section>

        {/* 2 — This week. The near-term horizon, composed from data already on
            the dashboard (due follow-ups, launch milestone). The card's own
            serif title carries the visible label — one label, not three. */}
        <section aria-labelledby="home-this-week" className="grid gap-2.5">
          <SectionHeading srOnly>
            <span id="home-this-week">This week</span>
          </SectionHeading>
          <ThisWeekCard data={data} degraded={degraded} />
        </section>

        {/* 3 — Ministry snapshot. Point-in-time vital signs + domain overview
            cards. Secondary to the urgent work above, so it sits lower and the
            deeper cards collapse behind a disclosure. The body (band + cards)
            depends on the slow Prospect-count / Multiply-grid reads, so the page
            streams it in its own <Suspense> boundary via `snapshotSlot` (#777
            WS2) — the heading stays here, outside the boundary, so it paints
            with the LCP-path content above. */}
        <section aria-labelledby="home-snapshot" className="grid gap-3">
          <SectionHeading>
            <span id="home-snapshot">Ministry snapshot</span>
          </SectionHeading>
          {snapshotSlot}
        </section>

        {/* 4 — Recent activity. Metadata only (counts + period), never note or
            summary bodies — those stay on the guarded care surfaces (ADR 0002).
            There is no /admin/activity route; the period slicer scopes these
            counts in place. */}
        <section
          aria-labelledby="home-recent-activity"
          className="grid gap-2.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionHeading>
              <span id="home-recent-activity">Recent activity</span>
            </SectionHeading>
            <div className="flex flex-wrap items-center justify-end gap-3">
              {canResetActivity ? (
                <div className="flex items-center gap-2">
                  <SuperAdminOnlyMark />
                  <ActivityResetControl
                    baselineOn={data.activity.resetBaselineOn}
                  />
                </div>
              ) : null}
              <PeriodSlicer current={data.activity.grain} />
            </div>
          </div>
          <ActivityBand activity={data.activity} guestsLive={guestsLive} />
        </section>
      </div>
    </PageBody>
  );
}
