import { cn } from "@/lib/utils";
import type { ListTab } from "./types";

export const TABS: { key: ListTab; label: string }[] = [
  { key: "all", label: "All groups" },
  { key: "needs_setup", label: "Needs setup" },
  { key: "needs_health_check", label: "Needs health check" },
  { key: "needs_attention", label: "Needs attention" },
  { key: "archived", label: "Archived" },
];

// What an empty tab means, in the operator's words — each list tab teaches its
// own all-clear (or next step) instead of the generic "no groups match".
// Search empties are handled separately, since "no match" there is about the
// query, not the bucket.
export const EMPTY_TAB_COPY: Record<ListTab, string> = {
  all: "No groups yet. Create your first with “New group” above.",
  needs_setup:
    "Nothing needs setup — every group has a shepherd, meeting details, and a capacity.",
  needs_health_check:
    "Nothing to check — every group has a Group-Health Grade and its required ratings.",
  needs_attention: "Nothing needs attention right now.",
  archived:
    "No archived groups. Archiving is reversible — an archived group would appear here, ready to restore.",
};

export function TabBar({
  tab,
  onTabChange,
  counts,
}: {
  tab: ListTab;
  onTabChange: (t: ListTab) => void;
  // Per-tab membership counts (Care shell's count-slot pattern) so each triage
  // bucket's size reads at a glance without clicking into it.
  counts: Record<ListTab, number>;
}) {
  return (
    <div
      role="tablist"
      aria-label="Group list view"
      className="flex flex-wrap gap-1 self-start rounded-pill border border-line bg-surface p-[3px]"
    >
      {TABS.map((t) => {
        const active = tab === t.key;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onTabChange(t.key)}
            className={cn(
              "inline-flex cursor-pointer items-center rounded-pill border-none px-3.5 py-2 font-sans text-sm transition-colors duration-150",
              active
                ? "bg-clay font-bold text-surface"
                : "bg-transparent font-medium text-ink3 hover:bg-surfaceAlt"
            )}
          >
            {t.label}
            {/* Full-opacity count: an opacity-dimmed count drops ink3 below
                WCAG AA (axe: 2.94:1), so it keeps the tab's own text color
                and reads smaller instead. */}
            <span className="ml-2 text-xs font-bold tabular-nums">
              {counts[t.key]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
