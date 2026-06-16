import { memo } from "react";
import { LinkButton } from "@/components/ui/button";
import { fieldLabelTextClassName } from "@/components/admin/forms/field-styles";
import { ScrollableTable } from "@/components/ui/scrollable-table";
import {
  isColumnShown,
  type GroupsTableDensity,
  type GroupsTableOptionalColumn,
} from "@/lib/dashboard/groups-table-prefs";
import type {
  GroupsTableSortDir,
  GroupsTableSortKey,
} from "@/lib/dashboard/groups-table-sort";
import {
  effectiveCapacity,
  isExcludedFromCapacityMetrics,
  unknownCapacity,
  type MetricDefaults,
} from "@/lib/admin/metrics";
import { cn } from "@/lib/utils";
import type {
  AttendanceSessionsRow,
  GroupMetricSettingsRow,
  GroupsRow,
  ProfilesRow,
} from "@/types/database";
import { GroupActionsMenu } from "./group-actions-menu";
import {
  groupAccessibleLabel,
  latestCheckinText,
  metaLine,
} from "./groups-helpers";
import {
  CapacityBadge,
  HealthBadge,
  LifecycleBadge,
  SetupBadge,
} from "./status-badges";
import type { GroupStatus, GroupTableRow } from "./types";

// The sortable columns, in render order. `numeric` columns get tabular-nums and
// the check-in column reuses the already-loaded latest-week session text. The
// "group" column is structural (never hideable); the rest carry an `optional`
// key so the header can filter them by the admin's saved column choice (#333).
const TABLE_COLUMNS: {
  key: GroupsTableSortKey;
  label: string;
  numeric?: boolean;
  // The matching optional-column key, or undefined for the structural "group"
  // column that is always shown.
  optional?: GroupsTableOptionalColumn;
}[] = [
  { key: "group", label: "Group" },
  { key: "leader", label: "Leader / co-leader", optional: "leader" },
  { key: "setup", label: "Setup", optional: "setup" },
  { key: "health", label: "Health grade", optional: "health" },
  { key: "capacity", label: "Capacity", numeric: true, optional: "capacity" },
  { key: "meeting", label: "Meeting day/time", optional: "meeting" },
  { key: "checkin", label: "Latest-week check-in", optional: "checkin" },
];

// Cell padding per density. Compact tightens the vertical rhythm so more groups
// fit on screen; comfortable keeps the historical roomy rows.
const DENSITY_CELL_CLASS: Record<GroupsTableDensity, string> = {
  comfortable: "p-3",
  compact: "px-3 py-1.5",
};

const DENSITY_HEADER_CLASS: Record<GroupsTableDensity, string> = {
  comfortable: "px-3 py-2.5",
  compact: "px-3 py-1.5",
};

// One table row, memoized like GroupCard so the table re-renders cheaply. A sort
// click only reorders these elements — their props are unchanged, so React skips
// re-rendering every row (the main INP win). Column/density toggles do change
// `shownColumns`/`density` for all rows, but those re-renders are cheap memoized
// leaves and run behind the deferred values in GroupsDirectory, off the click's
// critical path. The per-row scalars (override, member count) arrive resolved
// from the parent's stable maps so identical rows stay referentially equal.
const GroupTableRowView = memo(function GroupTableRowView({
  group,
  status,
  leaderText,
  session,
  shownColumns,
  density,
  override,
  memberCount,
  defaults,
  onEdit,
  isSuperAdmin,
  fromSetup,
}: {
  group: GroupsRow;
  status: GroupStatus;
  leaderText: string | null;
  session: AttendanceSessionsRow | null;
  shownColumns: GroupsTableOptionalColumn[];
  density: GroupsTableDensity;
  override: GroupMetricSettingsRow | null;
  memberCount: number;
  defaults: MetricDefaults;
  onEdit: (group: GroupsRow) => void;
  isSuperAdmin: boolean;
  fromSetup: boolean;
}) {
  const show = (column: GroupsTableOptionalColumn) =>
    isColumnShown(shownColumns, column);
  const cell = cn("align-top", DENSITY_CELL_CLASS[density]);
  const groupLabel = groupAccessibleLabel(group);
  const isArchived = status.lifecycle === "archived";
  const excluded = isExcludedFromCapacityMetrics(override);
  const cap = effectiveCapacity(group, override, defaults);
  const isCapacityUnknown = unknownCapacity(group, override, defaults);
  return (
    <tr className={cn("border-b border-lineSoft", isArchived && "opacity-70")}>
      {/* Group + lifecycle (structural — always shown) */}
      <td className={cell}>
        <div className="grid content-start gap-1">
          <span className="font-medium text-ink">{group.name}</span>
          <span>
            <LifecycleBadge category={status.lifecycle} />
          </span>
        </div>
      </td>
      {/* Leader / co-leader */}
      {show("leader") ? (
        <td className={cn(cell, "text-ink2")}>{leaderText ?? "Unassigned"}</td>
      ) : null}
      {/* Setup */}
      {show("setup") ? (
        <td className={cell}>
          <SetupBadge category={status.setup} />
        </td>
      ) : null}
      {/* Health grade */}
      {show("health") ? (
        <td className={cell}>
          <HealthBadge category={status.health} />
        </td>
      ) : null}
      {/* Capacity (numeric → tabular-nums, right-aligned) */}
      {show("capacity") ? (
        <td className={cn(cell, "text-right tabular-nums text-ink2")}>
          <div className="inline-flex flex-col items-end gap-1">
            <CapacityBadge category={status.capacity} />
            <span>
              {excluded
                ? "Excluded"
                : `${memberCount}${
                    isCapacityUnknown ? " / —" : ` / ${cap ?? "—"}`
                  }`}
            </span>
          </div>
        </td>
      ) : null}
      {/* Meeting day/time */}
      {show("meeting") ? (
        <td className={cn(cell, "text-ink2")}>{metaLine(group)}</td>
      ) : null}
      {/* Latest-week check-in — reuses the already-loaded session */}
      {show("checkin") ? (
        <td className={cn(cell, "text-ink3")}>{latestCheckinText(session)}</td>
      ) : null}
      {/* Actions — record-context names, unique per group */}
      <td className={cn(cell, "text-right")}>
        <div className="inline-flex flex-wrap justify-end gap-1.5">
          <LinkButton
            href={`/admin/groups/${group.id}${fromSetup ? "?from=setup" : ""}`}
            aria-label={`View ${groupLabel}`}
            variant="ghost"
            size="sm"
          >
            View
          </LinkButton>
          <GroupActionsMenu
            group={group}
            groupLabel={groupLabel}
            isArchived={isArchived}
            onEdit={onEdit}
            isSuperAdmin={isSuperAdmin}
          />
        </div>
      </td>
    </tr>
  );
});

export function GroupsTable({
  rows,
  sortKey,
  sortDir,
  onSort,
  shownColumns,
  density,
  activeMemberCountByGroup,
  overrideByGroupId,
  defaults,
  onEdit,
  isSuperAdmin,
  fromSetup = false,
}: {
  rows: GroupTableRow[];
  sortKey: GroupsTableSortKey;
  sortDir: GroupsTableSortDir;
  onSort: (key: GroupsTableSortKey) => void;
  shownColumns: GroupsTableOptionalColumn[];
  density: GroupsTableDensity;
  activeMemberCountByGroup: Map<string, number>;
  overrideByGroupId: Map<string, GroupMetricSettingsRow>;
  defaults: MetricDefaults;
  onEdit: (group: GroupsRow) => void;
  isSuperAdmin: boolean;
  fromSetup?: boolean;
}) {
  // Render the structural "group" column plus only the optional columns the
  // admin has chosen to show, keeping the table's fixed render order.
  const visibleColumns = TABLE_COLUMNS.filter(
    (col) => !col.optional || isColumnShown(shownColumns, col.optional)
  );
  const headerPad = DENSITY_HEADER_CLASS[density];
  return (
    <ScrollableTable>
      <table className="w-full border-collapse font-sans text-sm">
        <caption className="sr-only">
          Groups, with sortable columns for group, leader, setup, health grade,
          capacity, meeting day and time, and the latest-week check-in.
        </caption>
        <thead>
          <tr>
            {visibleColumns.map((col) => {
              const active = sortKey === col.key;
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={
                    active
                      ? sortDir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                  className={cn(
                    "border-b border-line p-0",
                    col.numeric ? "text-right" : "text-left"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSort(col.key)}
                    className={cn(
                      "inline-flex w-full cursor-pointer items-center gap-1 border-none bg-transparent",
                      col.numeric ? "justify-end" : "justify-start",
                      headerPad,
                      fieldLabelTextClassName,
                      active ? "text-ink" : "text-ink3"
                    )}
                  >
                    {col.label}
                    <span aria-hidden="true" className="text-2xs">
                      {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
                    </span>
                  </button>
                </th>
              );
            })}
            <th
              scope="col"
              className={cn(
                "border-b border-line text-right",
                headerPad,
                fieldLabelTextClassName
              )}
            >
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ group, status, leaderText, session }) => (
            <GroupTableRowView
              key={group.id}
              group={group}
              status={status}
              leaderText={leaderText}
              session={session}
              shownColumns={shownColumns}
              density={density}
              override={overrideByGroupId.get(group.id) ?? null}
              memberCount={activeMemberCountByGroup.get(group.id) ?? 0}
              defaults={defaults}
              onEdit={onEdit}
              isSuperAdmin={isSuperAdmin}
              fromSetup={fromSetup}
            />
          ))}
        </tbody>
      </table>
    </ScrollableTable>
  );
}
