import { StatusBadge } from "@/components/admin/console-status";
import { resolveFlag } from "@/lib/admin/feature-flags";
import { listUsagePeople } from "@/lib/admin/super-admin-usage-model";
import type { SuperAdminConsoleData } from "@/components/admin/super-admin/console-data";
import { UsagePanelShell } from "@/components/admin/super-admin/usage-panel-shell";
import {
  Panel,
  PanelTitle,
  WorkspaceHeader,
} from "@/components/admin/super-admin/console-primitives";

// ---------------------------------------------------------------------------
// Workspace — Usage
// ---------------------------------------------------------------------------

// Read-only usage telemetry: sign-ins and which top-level area each user opens,
// recorded only while the usage_tracking flag is on (the model resolves the flag
// to tell "off" apart from "on but quiet"). The server resolves the distinct
// people from the recent usage_events + the loaded profile map and hands the
// coarse events, that flat people list, and the flags to a client shell, which
// holds the person-filter selection and recomputes the pure usage model so the
// panel narrows to whoever is selected. Lifted out of Diagnostics into its own
// top-level tab so the activity log is a first-class destination, not a panel
// buried beneath the readiness checks.
function UsagePanel({ data }: { data: SuperAdminConsoleData }) {
  const trackingOn = resolveFlag(data.appConfig.featureFlags, "usage_tracking");

  const people = listUsagePeople({
    events: data.usageEvents,
    profilesById: data.profilesById,
  });

  return (
    <Panel id="usage">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <PanelTitle>Usage &amp; logins</PanelTitle>
        <StatusBadge
          label={trackingOn ? "Tracking on" : "Tracking off"}
          tone={trackingOn ? "active" : "disabled"}
        />
      </div>
      <p className="m-0 font-sans text-sm text-ink2">
        Coarse usage telemetry: sign-ins and which top-level area each user
        opens. Recording is gated by the{" "}
        <strong>Usage &amp; login tracking</strong> flag in Config → Feature
        flags; while it&rsquo;s off, nothing is recorded. Areas are structural
        facts only (which surface), never the content a user viewed.
      </p>

      {/* #899: a failed usage read must not render as "tracking on but quiet"
          — that empty state is a genuine fact, this one is "we don't know". So
          on failure the alert REPLACES the shell: rendering the shell below it
          would show its quiet empty state and reintroduce the false signal. */}
      {data.usageEventsError ? (
        <p
          role="alert"
          className="m-0 rounded-sm border border-clay bg-claySoft px-3.5 py-3 font-sans text-sm text-clayDeep"
        >
          Couldn&rsquo;t load usage events, so the activity log is unavailable.
          Refresh this page to try again.
        </p>
      ) : (
        <UsagePanelShell
          events={data.usageEvents}
          people={people}
          featureFlags={data.appConfig.featureFlags}
        />
      )}
    </Panel>
  );
}

export function UsageWorkspace({ data }: { data: SuperAdminConsoleData }) {
  return (
    <div className="grid min-w-0 gap-5">
      <WorkspaceHeader
        title="Usage"
        description="Read-only telemetry of sign-ins and which top-level area each user opens, recorded only while the Usage & login tracking flag is on."
      />
      <UsagePanel data={data} />
    </div>
  );
}
