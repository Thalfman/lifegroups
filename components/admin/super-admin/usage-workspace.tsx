import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/admin/console-status";
import { buildUsagePanelModel } from "@/lib/admin/super-admin-usage-model";
import type { SuperAdminConsoleData } from "@/components/admin/super-admin/console-data";
import {
  CARD_GRID_CLASS,
  MetricRow,
  Panel,
  PanelTitle,
  SubsectionHeader,
  TWO_CARD_GRID_CLASS,
  WorkspaceHeader,
} from "@/components/admin/super-admin/console-primitives";

// ---------------------------------------------------------------------------
// Workspace — Usage
// ---------------------------------------------------------------------------

// Read-only usage telemetry: sign-ins and which top-level area each user opens,
// recorded only while the usage_tracking flag is on (the model resolves the flag
// to tell "off" apart from "on but quiet"). Computed server-side from the recent
// usage_events + the loaded profile map — no client interactivity needed; the
// tallies and empty-state branching live in the pure usage model. Lifted out of
// Diagnostics into its own top-level tab so the activity log is a first-class
// destination, not a panel buried beneath the readiness checks.
function UsagePanel({ data }: { data: SuperAdminConsoleData }) {
  const usage = buildUsagePanelModel({
    events: data.usageEvents,
    profilesById: data.profilesById,
    featureFlags: data.appConfig.featureFlags,
  });

  return (
    <Panel id="usage">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <PanelTitle>Usage &amp; logins</PanelTitle>
        <StatusBadge
          label={usage.trackingOn ? "Tracking on" : "Tracking off"}
          tone={usage.trackingOn ? "active" : "disabled"}
        />
      </div>
      <p className="m-0 font-sans text-sm text-ink2">
        Coarse usage telemetry — sign-ins and which top-level area each user
        opens. Recording is gated by the{" "}
        <strong>Usage &amp; login tracking</strong> flag in Config → Feature
        flags; while it&rsquo;s off, nothing is recorded. Areas are structural
        facts only (which surface), never the content a user viewed.
      </p>

      {usage.emptyState === "tracking-off" ? (
        <p className="m-0 font-sans text-sm text-ink3">
          Tracking is off and nothing has been recorded. Turn on{" "}
          <strong>Usage &amp; login tracking</strong> in Config → Feature flags
          to start seeing logins and area usage here.
        </p>
      ) : usage.emptyState === "tracking-on" ? (
        <p className="m-0 font-sans text-sm text-ink3">
          Tracking is on. No activity has been recorded yet — events will appear
          here as users sign in and move around the app.
        </p>
      ) : (
        <>
          <div className={CARD_GRID_CLASS}>
            <div className="grid gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-3">
              <MetricRow label="Sign-ins" value={usage.loginCount} />
              <MetricRow label="Area opens" value={usage.areaViewCount} />
              <MetricRow label="People seen" value={usage.peopleSeenCount} />
            </div>
          </div>

          <div className={cn(TWO_CARD_GRID_CLASS, "items-start")}>
            <div className="grid min-w-0 gap-2">
              <SubsectionHeader
                title="Areas opened"
                hint="How often each top-level area was entered, busiest first."
              />
              {usage.areaRows.length === 0 ? (
                <p className="m-0 font-sans text-sm text-ink3">
                  No area views recorded yet.
                </p>
              ) : (
                <div className="grid gap-1.5">
                  {usage.areaRows.map((row) => (
                    <div key={row.area} className="grid gap-1">
                      <div className="flex justify-between gap-3 font-sans text-xs text-ink2">
                        <span>{row.label}</span>
                        <strong className="text-ink">{row.count}</strong>
                      </div>
                      <div
                        aria-hidden
                        className="h-1.5 overflow-hidden rounded-pill bg-lineSoft"
                      >
                        <div
                          className="h-full bg-sage"
                          style={{ width: `${row.barPercent}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid min-w-0 gap-2">
              <SubsectionHeader
                title="Recent sign-ins"
                hint="The latest logins, newest first."
              />
              {usage.recentLogins.length === 0 ? (
                <p className="m-0 font-sans text-sm text-ink3">
                  No sign-ins recorded yet.
                </p>
              ) : (
                <div className="grid gap-1.5">
                  {usage.recentLogins.map((login) => (
                    <div
                      key={login.id}
                      className="flex justify-between gap-3 font-sans text-xs text-ink2"
                    >
                      <span className="truncate font-semibold text-ink">
                        {login.name}
                      </span>
                      <span className="whitespace-nowrap">{login.at} UTC</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}

export function UsageWorkspace({ data }: { data: SuperAdminConsoleData }) {
  return (
    <div className="grid min-w-0 gap-5">
      <WorkspaceHeader
        title="Usage"
        description="Read-only telemetry of sign-ins and which top-level area each user opens — recorded only while the Usage & login tracking flag is on."
      />
      <UsagePanel data={data} />
    </div>
  );
}
