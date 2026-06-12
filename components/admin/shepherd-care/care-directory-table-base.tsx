import Link from "next/link";
import type { ReactNode } from "react";
import { buttonClassName } from "@/components/ui/button";
import { formatIsoDate } from "@/lib/shared/date";
import type { ShepherdCareDirectoryEntry } from "@/lib/supabase/read-models";
import { ShepherdCareStatusBadge } from "./status-badge";

// Shared presentational care-directory table. Both the admin directory (with
// an "Over-shepherd" coverage column) and the Over-Shepherd "My Shepherds"
// table render the same styling, status/last-contact/next-touchpoint/attention
// cells; only the first-column label, link target, role labels, empty text,
// and an optional extra column differ. Those are passed as props so the markup
// + styles live in one place.

const TH =
  "border-b border-line bg-sidebar px-3 py-2.5 text-left font-sans text-xs font-medium text-ink3";
const TD = "border-b border-lineSoft px-3 py-3 align-middle";

// An optional column inserted after "Role" (e.g. the admin "Over-shepherd"
// coverage column). The header is fixed text; render() produces each cell.
export type CareDirectoryExtraColumn = {
  header: string;
  render: (entry: ShepherdCareDirectoryEntry) => ReactNode;
};

export type CareDirectoryEmptyAction = {
  href: string;
  label: string;
};

export function CareDirectoryTable({
  entries,
  firstColumnLabel,
  roleLabels,
  hrefForEntry,
  emptyText,
  emptyAction,
  extraColumn,
}: {
  entries: ShepherdCareDirectoryEntry[];
  firstColumnLabel: string;
  roleLabels: Record<string, string>;
  hrefForEntry: (entry: ShepherdCareDirectoryEntry) => string;
  emptyText: string;
  emptyAction?: CareDirectoryEmptyAction;
  extraColumn?: CareDirectoryExtraColumn;
}) {
  if (entries.length === 0) {
    return (
      <div className="grid justify-items-center gap-3 px-3 py-8 text-center font-sans text-sm text-ink3">
        <p className="m-0">{emptyText}</p>
        {emptyAction ? (
          <Link
            href={emptyAction.href}
            className={buttonClassName("ghost", "sm")}
          >
            {emptyAction.label}
          </Link>
        ) : null}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-sm border border-line">
      <table className="w-full border-collapse font-sans text-sm text-ink">
        <thead>
          <tr>
            <th className={TH}>{firstColumnLabel}</th>
            <th className={TH}>Role</th>
            {extraColumn ? <th className={TH}>{extraColumn.header}</th> : null}
            <th className={TH}>Status</th>
            <th className={TH}>Last contact</th>
            <th className={TH}>Next touchpoint</th>
            <th className={TH}>Attention</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const status = entry.care?.current_status ?? "doing_well";
            const lastContact = entry.care?.last_contact_at ?? null;
            const nextTouchpoint = entry.care?.next_touchpoint_due ?? null;
            return (
              <tr
                key={entry.profile.id}
                className="transition-colors duration-150 hover:bg-surfaceAlt"
              >
                <td className={TD}>
                  <Link
                    href={hrefForEntry(entry)}
                    className="font-semibold text-ink no-underline hover:underline"
                  >
                    {entry.profile.full_name}
                  </Link>
                  <div className="text-xs text-ink3">{entry.profile.email}</div>
                </td>
                <td className={TD}>
                  {roleLabels[entry.profile.role] ?? entry.profile.role}
                </td>
                {extraColumn ? (
                  <td className={TD}>{extraColumn.render(entry)}</td>
                ) : null}
                <td className={TD}>
                  {entry.care ? (
                    <ShepherdCareStatusBadge status={status} />
                  ) : (
                    <span className="text-ink3">—</span>
                  )}
                </td>
                <td className={TD}>
                  {lastContact ? (
                    formatIsoDate(lastContact)
                  ) : (
                    <span className="text-ink3">Never</span>
                  )}
                </td>
                <td className={TD}>
                  {nextTouchpoint ? formatIsoDate(nextTouchpoint) : "—"}
                </td>
                <td className={TD}>
                  {entry.needs_attention ? (
                    <span
                      title="Needs attention"
                      className="inline-block h-2.5 w-2.5 rounded-pill bg-clay"
                      aria-label="Needs attention"
                    />
                  ) : (
                    <span className="text-ink3">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
