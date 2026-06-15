"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { fieldLabelTextClassName } from "@/components/admin/forms/field-styles";
import {
  GROUPS_TABLE_DENSITIES,
  GROUPS_TABLE_OPTIONAL_COLUMNS,
  isColumnShown,
  type GroupsTableDensity,
  type GroupsTableOptionalColumn,
} from "@/lib/dashboard/groups-table-prefs";
import { cn } from "@/lib/utils";
import type { ViewMode } from "./types";

// The shared look for the two segmented radio controls below (view mode +
// density) — the same quiet pill rail the migrated invite form uses.
const SEGMENT_GROUP_CLASS =
  "inline-flex flex-wrap gap-1 rounded-pill border border-line bg-sidebar p-1";

function segmentItemClassName(active: boolean): string {
  return cn(
    "cursor-pointer rounded-pill border px-3.5 py-2 font-sans text-sm font-medium leading-tight transition-colors duration-150",
    active
      ? "border-line bg-surface font-semibold text-ink"
      : "border-transparent bg-transparent text-ink2 hover:bg-surface/60"
  );
}

// A two-option segmented control that switches the directory between the
// six-zone cards and the dense Ops table. The choice persists per browser,
// scoped to the signed-in admin (usePersistedViewState). Rendered as an explicit
// radiogroup so the current view is announced and keyboard-reachable.
export function ViewModeToggle({
  mode,
  onModeChange,
}: {
  mode: ViewMode;
  onModeChange: (m: ViewMode) => void;
}) {
  const options: { key: ViewMode; label: string }[] = [
    { key: "cards", label: "Cards" },
    { key: "table", label: "Table" },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Group list layout"
      className={SEGMENT_GROUP_CLASS}
    >
      {options.map((o) => {
        const active = mode === o.key;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onModeChange(o.key)}
            className={segmentItemClassName(active)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// A two-option segmented control that switches the Ops table between the roomy
// "comfortable" rows and the tighter "compact" rows. The choice persists per
// browser, scoped to the signed-in admin, alongside the other Groups view prefs.
// Rendered as a radiogroup so the current density is announced and keyboard-
// reachable, matching the card⇄table toggle's pattern.
const DENSITY_LABELS: Record<GroupsTableDensity, string> = {
  comfortable: "Comfortable",
  compact: "Compact",
};

export function DensityToggle({
  density,
  onDensityChange,
}: {
  density: GroupsTableDensity;
  onDensityChange: (d: GroupsTableDensity) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Table density"
      className={SEGMENT_GROUP_CLASS}
    >
      {GROUPS_TABLE_DENSITIES.map((d) => {
        const active = density === d;
        return (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onDensityChange(d)}
            className={segmentItemClassName(active)}
          >
            {DENSITY_LABELS[d]}
          </button>
        );
      })}
    </div>
  );
}

// Per-column show/hide toggles for the table's optional columns. Each is a
// checkbox so its state is announced, grouped under a labelled fieldset so a
// screen-reader user hears the group purpose. The last shown column can't be
// hidden (the toggle helper refuses it), so it is rendered disabled to make that
// constraint visible. The shown set persists with the other Groups view prefs.
const COLUMN_MENU_LABELS: Record<GroupsTableOptionalColumn, string> = {
  leader: "Leader / co-leader",
  setup: "Setup",
  health: "Health grade",
  capacity: "Capacity",
  meeting: "Meeting day/time",
  checkin: "Latest-week check-in",
};

export function ColumnVisibilityMenu({
  columns,
  onToggleColumn,
}: {
  columns: GroupsTableOptionalColumn[];
  onToggleColumn: (column: GroupsTableOptionalColumn) => void;
}) {
  const [open, setOpen] = useState(false);
  const lastShown = columns.length <= 1;
  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
      >
        Columns
      </Button>
      {open ? (
        // Floating menu: shadow, no border (elevation rule — never both).
        <fieldset className="absolute left-0 top-[calc(100%+6px)] z-dropdown m-0 grid min-w-[200px] gap-2 rounded-md border-0 bg-surface px-3.5 py-3 shadow-softLg">
          <legend className={cn("p-0", fieldLabelTextClassName)}>
            Show columns
          </legend>
          {GROUPS_TABLE_OPTIONAL_COLUMNS.map((col) => {
            const shown = isColumnShown(columns, col);
            // The single remaining shown column can't be hidden — disable it so
            // the constraint is visible rather than a silent no-op.
            const disabled = shown && lastShown;
            return (
              <label
                key={col}
                className={cn(
                  "flex items-center gap-2 font-sans text-sm",
                  disabled
                    ? "cursor-default text-ink3"
                    : "cursor-pointer text-ink2"
                )}
              >
                <input
                  type="checkbox"
                  checked={shown}
                  disabled={disabled}
                  onChange={() => onToggleColumn(col)}
                />
                {COLUMN_MENU_LABELS[col]}
              </label>
            );
          })}
        </fieldset>
      ) : null}
    </div>
  );
}
