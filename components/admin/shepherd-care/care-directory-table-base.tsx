import Link from "next/link";
import type { ReactNode } from "react";
import { buttonClassName } from "@/components/ui/button";
import { formatIsoDate } from "@/lib/shared/date";
import type { ShepherdCareDirectoryEntry } from "@/lib/supabase/shepherd-care-reads";
import { ShepherdCareStatusBadge } from "./status-badge";

// Shared presentational care-directory listing. Both the admin directory (with
// an "Over-shepherd" coverage column) and the Over-Shepherd "My Shepherds"
// table render the same status/last-contact/next-touchpoint/attention data;
// only the first-column label, link target, role labels, empty text, and an
// optional extra column differ. Those are passed as props so the markup +
// styles live in one place.
//
// Mobile-first (#567): at base (phone) the directory renders as a stack of
// readable cards — one per leader, every field on its own labelled line, no
// horizontal scroll. At `md`+ it restores the dense, desktop-identical table.
// Both views render from the same entries, so behavior and data are unchanged.

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
    <>
      {/* Mobile: a stack of cards, one per leader. No table, so nothing forces
          horizontal scroll at 375px. Hidden at md+ where the table takes over. */}
      <ul className="m-0 grid list-none gap-3 p-0 md:hidden">
        {entries.map((entry) => (
          <CareDirectoryCard
            key={entry.profile.id}
            entry={entry}
            roleLabels={roleLabels}
            hrefForEntry={hrefForEntry}
            extraColumn={extraColumn}
          />
        ))}
      </ul>

      {/* Desktop (md+): the dense table, visually identical to before. */}
      <div className="hidden overflow-x-auto rounded-sm border border-line md:block">
        <table className="w-full border-collapse font-sans text-sm text-ink">
          <thead>
            <tr>
              <th className={TH}>{firstColumnLabel}</th>
              <th className={TH}>Role</th>
              {extraColumn ? (
                <th className={TH}>{extraColumn.header}</th>
              ) : null}
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
                    <div className="text-xs text-ink3">
                      {entry.profile.email}
                    </div>
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
                        role="img"
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
    </>
  );
}

// One leader as a stacked card (mobile). Renders the same fields the table row
// does, each on its own labelled line so a row is readable without horizontal
// scroll. The name stays the link into the care-history detail surface, and the
// "Needs attention" dot keeps its accessible label.
function CareDirectoryCard({
  entry,
  roleLabels,
  hrefForEntry,
  extraColumn,
}: {
  entry: ShepherdCareDirectoryEntry;
  roleLabels: Record<string, string>;
  hrefForEntry: (entry: ShepherdCareDirectoryEntry) => string;
  extraColumn?: CareDirectoryExtraColumn;
}) {
  const status = entry.care?.current_status ?? "doing_well";
  const lastContact = entry.care?.last_contact_at ?? null;
  const nextTouchpoint = entry.care?.next_touchpoint_due ?? null;
  return (
    <li className="grid gap-2.5 rounded-sm border border-line bg-surface p-3.5 font-sans text-sm text-ink">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={hrefForEntry(entry)}
            className="font-semibold text-ink no-underline hover:underline"
          >
            {entry.profile.full_name}
          </Link>
          {/* Emails are unbroken tokens; allow them to wrap anywhere so a long
              address stays readable instead of clipping under the mobile
              overflow-x rule (#567 review). */}
          <div className="text-xs text-ink3 [overflow-wrap:anywhere]">
            {entry.profile.email}
          </div>
        </div>
        {entry.needs_attention ? (
          <span
            role="img"
            title="Needs attention"
            className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-pill bg-clay"
            aria-label="Needs attention"
          />
        ) : null}
      </div>
      <CareCardField label="Role">
        {roleLabels[entry.profile.role] ?? entry.profile.role}
      </CareCardField>
      {extraColumn ? (
        <CareCardField label={extraColumn.header}>
          {extraColumn.render(entry)}
        </CareCardField>
      ) : null}
      <CareCardField label="Status">
        {entry.care ? (
          <ShepherdCareStatusBadge status={status} />
        ) : (
          <span className="text-ink3">—</span>
        )}
      </CareCardField>
      <CareCardField label="Last contact">
        {lastContact ? (
          formatIsoDate(lastContact)
        ) : (
          <span className="text-ink3">Never</span>
        )}
      </CareCardField>
      <CareCardField label="Next touchpoint">
        {nextTouchpoint ? formatIsoDate(nextTouchpoint) : "—"}
      </CareCardField>
    </li>
  );
}

function CareCardField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-medium text-ink3">{label}</span>
      <span className="text-right text-ink2">{children}</span>
    </div>
  );
}
