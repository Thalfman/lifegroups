import Link from "next/link";
import { cn } from "@/lib/utils";
import { WorkspaceSectionNav } from "@/components/admin/workspace-section-nav";
import { PlatformConfigTracerForm } from "@/components/admin/forms/platform-config-tracer-form";
import { FeatureFlagToggleForm } from "@/components/admin/forms/feature-flag-toggle-form";
import { StatusBadge } from "@/components/admin/console-status";
import { buildFeatureFlagRows } from "@/lib/admin/feature-flag-display";
import type { SuperAdminConsoleData } from "@/components/admin/super-admin/console-data";
import {
  CommandCard,
  Panel,
  PanelTitle,
  TWO_CARD_GRID_CLASS,
  WorkspaceHeader,
} from "@/components/admin/super-admin/console-primitives";

// ---------------------------------------------------------------------------
// Workspace 3 — Config
// ---------------------------------------------------------------------------

export function ConfigWorkspace({ data }: { data: SuperAdminConsoleData }) {
  return (
    <div className="grid min-w-0 gap-4">
      <WorkspaceHeader
        title="Config"
        description="Feature flags, owner settings, and editable copy. Flags marked Held stay off until they pass a safety review; clearing a copy value falls back to its built-in default."
      />
      <WorkspaceSectionNav
        ariaLabel="Config sections"
        sections={[
          { id: "features", label: "Feature flags" },
          { id: "settings", label: "Owner settings" },
          { id: "ministry-settings", label: "Ministry settings" },
        ]}
      />
      <FeatureFlagsCard data={data} />
      <div className={TWO_CARD_GRID_CLASS}>
        <OwnerSettingsCard data={data} />
        <CommandCard
          id="ministry-settings"
          title="Ministry settings"
          description="Capacity, check-in timing, and health thresholds stay in the day-to-day admin settings page."
          status={{ label: "Linked", tone: "active" }}
        >
          <Link
            href="/admin/settings"
            className="font-sans text-sm font-semibold text-clay no-underline"
          >
            Open admin settings
          </Link>
        </CommandCard>
      </div>
    </div>
  );
}

function OwnerSettingsCard({ data }: { data: SuperAdminConsoleData }) {
  return (
    <CommandCard
      id="settings"
      title="Owner settings"
      description="A small saved value you can use to confirm owner settings persist correctly. Saving writes to the owner-only settings with a matching audit entry."
      status={
        data.errors.platformConfig
          ? { label: "Read failed", tone: "blocked" }
          : { label: "Live", tone: "active" }
      }
    >
      {data.errors.platformConfig ? (
        // The form is intentionally withheld on a failed read: the built-in
        // fallback would render the field empty, and saving that would
        // overwrite the real stored value.
        <p className="m-0 font-sans text-sm text-rose">
          Couldn’t load owner settings ({data.errors.platformConfig}). Editing
          is disabled until the value reads successfully, so a failed read can’t
          silently overwrite it.
        </p>
      ) : (
        <>
          <div className="font-sans text-xs text-ink2">
            Current value:{" "}
            <strong className="text-ink">
              {data.appConfig.consoleTracerNote
                ? data.appConfig.consoleTracerNote
                : "(empty)"}
            </strong>
          </div>
          <PlatformConfigTracerForm value={data.appConfig.consoleTracerNote} />
        </>
      )}
    </CommandCard>
  );
}

// Real feature-flag list with resolved state + toggles. Each row reads as a
// switch with a name, badges (kind + resolved On/Off), a short risk note, and
// the toggle. The badge/risk-note wording is derived in the pure
// feature-flag-display model; this card only renders the rows.
function FeatureFlagsCard({ data }: { data: SuperAdminConsoleData }) {
  const rows = buildFeatureFlagRows(data.appConfig.featureFlags);
  return (
    <Panel id="features">
      <PanelTitle>Feature flags</PanelTitle>
      <p className="m-0 font-sans text-sm text-ink2">
        Most flags take effect as soon as you flip them. Flags marked{" "}
        <strong>Held</strong> only record your intent: the surface stays off
        until it passes a safety review, so nothing is re-exposed by accident.
        Flags marked <strong>Nav</strong> show or hide a tab in the admin
        navigation. Hiding a tab does not block access to its pages.
      </p>
      <div className="grid gap-2.5">
        {rows.map((row) => (
          <div
            key={row.key}
            className={cn(
              "flex flex-wrap items-start justify-between gap-3 rounded-sm border p-3",
              // Frozen rows carry a distinct amber tint so they don't read
              // as ordinary toggles (tinted surface, not a stripe).
              row.frozen ? "border-amber bg-amberSoft" : "border-line"
            )}
          >
            <div className="min-w-0 flex-1 basis-56">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-sans text-sm font-semibold text-ink">
                  {row.label}
                </span>
                <StatusBadge
                  label={row.kindBadge.label}
                  tone={row.kindBadge.tone}
                />
                <StatusBadge
                  label={row.stateBadge.label}
                  tone={row.stateBadge.tone}
                />
              </div>
              <p className="m-0 mt-1 font-sans text-xs leading-snug text-ink2">
                {row.description}
              </p>
              {row.riskNote ? (
                <p
                  className={cn(
                    "m-0 mt-1 font-sans text-xs",
                    row.riskNote.heldOff ? "text-amberText" : "text-ink2"
                  )}
                >
                  {row.riskNote.text}
                </p>
              ) : null}
            </div>
            <FeatureFlagToggleForm
              flagKey={row.key}
              flagLabel={row.label}
              enabled={row.enabled}
              held={row.frozen}
            />
          </div>
        ))}
      </div>
      <FeatureFlagTechnicalNotes />
    </Panel>
  );
}

// The engineering rationale behind the flag kinds (ADR references, RLS
// re-verification, direct-URL route behavior) lives behind a plain disclosure
// — the same native-<details> pattern as HelpAboutDetails — so the default
// Config view reads as an admin console, not internal engineering notes
// (#461). Real cautions stay visible in the rows above; only the rationale
// moves down here.
function FeatureFlagTechnicalNotes() {
  return (
    <details className="rounded-sm border border-line">
      <summary className="lg-sac-summary flex items-center gap-2 px-3 py-2.5 font-sans text-sm font-semibold text-ink2">
        Technical notes: how flags are enforced
      </summary>
      <ul className="m-0 grid gap-1.5 pb-3 pl-7 pr-3 pt-0 font-sans text-xs leading-relaxed text-ink2">
        <li>
          Held flags gate surfaces frozen by ADR 0002. Under ADR 0009&rsquo;s
          verify-before-flip rule the toggle only stores intent; the surface
          turns on once its routes and RLS policies are re-verified, which sets
          a separate verified marker the toggle itself can never write.
        </li>
        <li>
          Nav flags govern the top-level tabs the Care · Plan · Multiply pivot
          (ADR 0016) hides by default: Groups, People, and Planning. The flag
          controls nav visibility only; the routes themselves keep resolving by
          direct URL whether or not the tab is shown.
        </li>
        <li>
          Every flip is a Super-Admin-only write through the audited
          feature-flag action, so each change records a matching audit entry.
        </li>
      </ul>
    </details>
  );
}
