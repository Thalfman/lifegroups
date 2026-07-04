import { useMemo } from "react";
import {
  ALL_TYPE_OPTIONS,
  calendarActiveFilterChips,
  type CalendarFilters,
  type CalendarViewMode,
} from "@/lib/admin/master-calendar-view";
import { WEEKDAY_HEADERS } from "@/lib/calendar/occurrences";
import { EVENT_STATUS_OPTIONS } from "@/lib/calendar/payload";
import type {
  MasterCalendarGroupSummary,
  MasterCalendarLeader,
} from "@/lib/admin/master-calendar";
import type {
  GroupCalendarEventStatus,
  GroupCalendarEventType,
} from "@/types/enums";
import { ActiveFilterChips, type ActiveChip } from "./active-filter-chips";
import { GroupsDetailsField } from "./groups-details-field";
import { MultiCheckboxField } from "./multi-checkbox-field";
import { SelectField } from "./select-field";
import { ViewToggle } from "./view-toggle";
import { Button } from "@/components/ui/button";

type ViewMode = CalendarViewMode;

export function FilterBar({
  groups,
  leaderOptions,
  groupFilter,
  setGroupFilter,
  typeFilter,
  setTypeFilter,
  statusFilter,
  setStatusFilter,
  dayFilter,
  setDayFilter,
  leaderFilter,
  setLeaderFilter,
  hasActiveFilters,
  onReset,
  viewMode,
  onChangeView,
  filteredCount,
  totalCount,
  hideViewToggle = false,
}: {
  groups: MasterCalendarGroupSummary[];
  leaderOptions: MasterCalendarLeader[];
  groupFilter: string[];
  setGroupFilter: (next: string[]) => void;
  typeFilter: GroupCalendarEventType[];
  setTypeFilter: (next: GroupCalendarEventType[]) => void;
  statusFilter: GroupCalendarEventStatus[];
  setStatusFilter: (next: GroupCalendarEventStatus[]) => void;
  dayFilter: number[];
  setDayFilter: (next: number[]) => void;
  leaderFilter: string;
  setLeaderFilter: (next: string) => void;
  hasActiveFilters: boolean;
  onReset: () => void;
  viewMode: ViewMode;
  onChangeView: (next: ViewMode) => void;
  filteredCount: number;
  totalCount: number;
  // Hide the Month/List toggle when the opinionated views own the primary view
  // slot (#331): By leader has its own layout and the other Planning views read
  // as the list, so the grid/list toggle would be misleading there.
  hideViewToggle?: boolean;
}) {
  const groupOptions = useMemo(
    () => groups.map((g) => ({ value: g.groupId, label: g.groupName })),
    [groups]
  );

  // Flatten every active selection into removable chips (built pure in
  // lib/admin/master-calendar-view; order mirrors the field grid). A chip's
  // `remove` drops exactly one selection and keeps the other dimensions'
  // identity, so handing every dimension back to its setter is a referential
  // no-op for all but the removed one.
  const activeChips = useMemo<ActiveChip[]>(() => {
    const filters: CalendarFilters = {
      groupFilter,
      typeFilter,
      statusFilter,
      dayFilter,
      leaderFilter,
    };
    return calendarActiveFilterChips(filters, { groups, leaderOptions }).map(
      (chip) => ({
        key: chip.key,
        category: chip.category,
        label: chip.label,
        onRemove: () => {
          const next = chip.remove(filters);
          setGroupFilter(next.groupFilter);
          setTypeFilter(next.typeFilter);
          setStatusFilter(next.statusFilter);
          setDayFilter(next.dayFilter);
          setLeaderFilter(next.leaderFilter);
        },
      })
    );
  }, [
    groups,
    leaderOptions,
    groupFilter,
    setGroupFilter,
    typeFilter,
    setTypeFilter,
    statusFilter,
    setStatusFilter,
    dayFilter,
    setDayFilter,
    leaderFilter,
    setLeaderFilter,
  ]);

  // Show the {n}/{m} hint only when filters are active AND there's
  // something left to show. When filteredCount === 0 the EmptyState
  // carries the message; doubling up reads as noise.
  const showHint = hasActiveFilters && filteredCount > 0;
  return (
    <section className="grid gap-2.5 rounded-lg border border-line bg-surface px-3.5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <div className="font-sans text-2xs font-semibold uppercase tracking-[1.5px] text-ink3">
            Filters
          </div>
          {showHint ? (
            <div aria-live="polite" className="font-sans text-xs text-ink3">
              {filteredCount} of {totalCount} shown
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {hasActiveFilters ? (
            <Button type="button" onClick={onReset} variant="ghost" size="sm">
              Reset filters
            </Button>
          ) : null}
          {hideViewToggle ? null : (
            <ViewToggle viewMode={viewMode} onChange={onChangeView} />
          )}
        </div>
      </div>
      <ActiveFilterChips chips={activeChips} />
      <div className="lg-m-master-calendar-filters grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] items-start gap-2.5">
        <GroupsDetailsField
          options={groupOptions}
          value={groupFilter}
          onChange={setGroupFilter}
        />
        <MultiCheckboxField<GroupCalendarEventType>
          label="Gathering type"
          name="gathering-type"
          fieldKey="gathering-type"
          options={ALL_TYPE_OPTIONS}
          value={typeFilter}
          onChange={(next) => setTypeFilter(next)}
        />
        <MultiCheckboxField<GroupCalendarEventStatus>
          label="Status"
          name="status"
          fieldKey="status"
          options={EVENT_STATUS_OPTIONS}
          value={statusFilter}
          onChange={(next) => setStatusFilter(next)}
        />
        <MultiCheckboxField<number>
          label="Meeting day"
          name="meeting-day"
          fieldKey="meeting-day"
          options={WEEKDAY_HEADERS.map((wd, i) => ({ value: i, label: wd }))}
          value={dayFilter}
          onChange={(next) => setDayFilter(next)}
        />
        <SelectField
          label="Shepherd / co-shepherd"
          value={leaderFilter}
          onChange={setLeaderFilter}
          options={[
            { value: "", label: "All shepherds" },
            ...leaderOptions.map((l) => ({
              value: l.profileId,
              label: l.name,
            })),
          ]}
        />
      </div>
    </section>
  );
}
