import Link from "next/link";
import { Badge, STATUS_TONES, type BadgeTone } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import type { CareItem, CareItemDueTone } from "@/lib/admin/care-area";
import { SuperAdminInlineDelete } from "@/components/admin/super-admin/inline-delete";

// One care item rendered with the reduction-plan six-field structure (#301):
// Person, Reason, Related group, Due date, Owner, Action. The action is the ONE
// obvious next step for the item — Log contact / Assign over-shepherd / Schedule
// touchpoint / Resolve follow-up (#332), resolved in lib/admin/care-next-action
// — never a vague Open / Manage / Update. Each links into the per-leader detail
// page (deep-linked to the tab that hosts the action's existing form) where the
// work actually happens; the action's accessible name carries the person so it
// reads "Log contact for Jane Doe", not a bare verb.

// Due-date pill tones on the status vocabulary: overdue = clay (needs
// follow-up), soon = amber (watch), neutral dates stay quiet.
const DUE_TONE: Record<CareItemDueTone, BadgeTone> = {
  overdue: STATUS_TONES.followUp,
  soon: STATUS_TONES.watch,
  neutral: "ghost",
};

function MetaBit({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="mr-1.5 font-sans text-xs font-medium text-ink3">
        {label}
      </span>
      <span className="text-ink2">{value}</span>
    </span>
  );
}

export function CareItemList({
  items,
  emptyTitle,
  emptyDescription,
  isSuperAdmin = false,
}: {
  items: CareItem[];
  emptyTitle: string;
  emptyDescription: string;
  // SAD9: when the viewer is the super admin, each row that maps to a deletable
  // DB record (care follow-up / interaction) gets an inline Delete control.
  isSuperAdmin?: boolean;
}) {
  if (items.length === 0) {
    return (
      <div className="grid justify-items-center gap-1.5 rounded-lg border border-dashed border-line bg-surface px-4 py-8 text-center">
        <div className="font-sans font-semibold text-ink">{emptyTitle}</div>
        <div className="font-sans text-sm text-ink3">{emptyDescription}</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-1">
      {items.map((item) => {
        return (
          <div
            key={item.key}
            className="flex min-h-11 items-start justify-between gap-4 border-b border-lineSoft py-3.5"
          >
            <div className="min-w-0 flex-1">
              <div className="font-sans text-base font-semibold text-ink [overflow-wrap:anywhere]">
                {item.personName}
              </div>
              <div className="mt-0.5 font-sans text-sm italic text-ink2">
                {item.reason}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-3 font-sans text-sm text-ink3">
                <MetaBit label="Group" value={item.groupName ?? "—"} />
                <MetaBit
                  label="Owner"
                  value={
                    item.ownerName
                      ? `Assigned to ${item.ownerName}`
                      : "Unassigned"
                  }
                />
                {item.dueLabel ? (
                  <Badge tone={DUE_TONE[item.dueTone]}>{item.dueLabel}</Badge>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 self-center">
              <Link
                href={item.actionHref}
                // Record-context accessible name (#332 / req 4): assistive tech
                // announces "Log contact for Jane Doe", not a bare "Log contact"
                // repeated down the list. The visible label stays the short verb.
                aria-label={item.actionAccessibleName}
                className={buttonClassName("ghost", "sm", "whitespace-nowrap")}
              >
                {item.actionLabel} →
              </Link>
              {isSuperAdmin && item.deleteTarget ? (
                <SuperAdminInlineDelete
                  entityType={item.deleteTarget.entityType}
                  id={item.deleteTarget.id}
                  label={`${item.personName}: ${item.reason}`}
                />
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
