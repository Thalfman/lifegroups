import { memo } from "react";
import { LinkButton } from "@/components/ui/button";
import { cardClassName } from "@/components/lg/Card";
import { fieldLabelTextClassName } from "@/components/admin/forms/field-styles";
import {
  effectiveCapacity,
  isExcludedFromCapacityMetrics,
  unknownCapacity,
  type MetricDefaults,
} from "@/lib/admin/metrics";
import { cn } from "@/lib/utils";
import type {
  AttendanceSessionsRow,
  GroupLeadersRow,
  GroupMetricSettingsRow,
  GroupsRow,
  ProfilesRow,
} from "@/types/database";
import { GroupActionsMenu } from "./group-actions-menu";
import {
  groupAccessibleLabel,
  latestCheckinText,
  leaderTextFor,
  metaLine,
} from "./groups-helpers";
import {
  CapacityBadge,
  HealthBadge,
  LifecycleBadge,
  SetupBadge,
} from "./status-badges";
import type { GroupStatus } from "./types";

// Zones: Header (name + lifecycle), Setup (leader + setup completeness),
// Health (Group-Health Grade), Capacity (size vs capacity), Meeting (day/time/
// location), Actions (View group). The four status categories show as four
// separate chips, never a combined one.
//
// Memoized so re-renders that don't change a card's props (e.g. each keystroke
// in the debounced search) skip re-rendering every card. Props are referentially
// stable: the lookup maps are memoized and the rows come straight from props.
export const GroupCard = memo(function GroupCard({
  group,
  status,
  leaders,
  profilesById,
  activeMemberCount,
  latestSession,
  override,
  defaults,
  onEdit,
  isSuperAdmin,
}: {
  group: GroupsRow;
  status: GroupStatus;
  leaders: GroupLeadersRow[];
  profilesById: Map<string, ProfilesRow>;
  activeMemberCount: number;
  latestSession: AttendanceSessionsRow | null;
  override: GroupMetricSettingsRow | null;
  defaults: MetricDefaults;
  // Opens the shared editing drawer for this group (#266). The card itself
  // stays a read-only row — editing no longer happens inline.
  onEdit: (group: GroupsRow) => void;
  isSuperAdmin: boolean;
}) {
  const isArchived = status.lifecycle === "archived";
  // Repeated row actions name their group plus a stable discriminator so two
  // groups that share a name stay distinguishable (shared with the table mode).
  const groupLabel = groupAccessibleLabel(group);

  const cap = effectiveCapacity(group, override, defaults);
  const isCapacityUnknown = unknownCapacity(group, override, defaults);
  const excluded = isExcludedFromCapacityMetrics(override);

  const leaderText = leaderTextFor(leaders, profilesById) ?? "Unassigned";

  return (
    <article
      className={cn(cardClassName, "grid gap-3.5", isArchived && "opacity-70")}
    >
      {/* Zone 1 — Header: name + lifecycle (only). The other three categories
          live in their own zones below, so the header never combines them. */}
      <header className="grid grid-cols-1 items-start gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="m-0 font-display text-xl font-medium text-ink">
              {group.name}
            </h3>
            <LifecycleBadge category={status.lifecycle} />
          </div>
        </div>
        {/* Zone 6 — Actions */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <LinkButton
            href={`/admin/groups/${group.id}`}
            aria-label={`View ${groupLabel}`}
            variant="solid"
            size="sm"
          >
            View group
          </LinkButton>
          <GroupActionsMenu
            group={group}
            groupLabel={groupLabel}
            isArchived={isArchived}
            onEdit={onEdit}
            isSuperAdmin={isSuperAdmin}
          />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[repeat(auto-fit,minmax(180px,1fr))] md:gap-3.5">
        {/* Zone 2 — Setup: leader + setup completeness */}
        <Zone label="Setup">
          <SetupBadge category={status.setup} />
          <ZoneText>{leaderText}</ZoneText>
        </Zone>

        {/* Zone 3 — Health: the Group-Health Grade (Q12), not care status */}
        <Zone label="Health">
          <HealthBadge category={status.health} />
        </Zone>

        {/* Zone 4 — Capacity: size vs capacity */}
        <Zone label="Capacity">
          <CapacityBadge category={status.capacity} />
          <ZoneText>
            {excluded
              ? "Excluded from capacity"
              : `${activeMemberCount}${
                  isCapacityUnknown ? " / Unknown" : ` / ${cap ?? "—"}`
                } members`}
          </ZoneText>
        </Zone>

        {/* Zone 5 — Meeting: day/time/location */}
        <Zone label="Meeting">
          <ZoneText>{metaLine(group)}</ZoneText>
          <ZoneText muted>{latestCheckinText(latestSession)}</ZoneText>
        </Zone>
      </div>

      {group.description ? (
        <p className="m-0 font-sans text-sm leading-normal text-ink2">
          {group.description}
        </p>
      ) : null}
    </article>
  );
});

function Zone({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid content-start gap-1.5">
      <div className={fieldLabelTextClassName}>{label}</div>
      {children}
    </div>
  );
}

function ZoneText({
  children,
  muted = false,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "font-sans text-sm leading-snug",
        muted ? "text-ink3" : "text-ink2"
      )}
    >
      {children}
    </div>
  );
}
