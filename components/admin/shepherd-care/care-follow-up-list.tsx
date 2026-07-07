import { Badge, type BadgeTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { noteBodyClassName } from "@/components/notes/note-card";
import { CareFollowUpStatusControls } from "@/components/admin/shepherd-care/care-follow-up-status-controls";
import { shepherdCareFollowUpStatusLabel } from "@/lib/dashboard/labels";
import { formatIsoDate } from "@/lib/shared/date";
import {
  isFollowUpOverdue,
  sortFollowUpsByUrgency,
} from "@/lib/admin/shepherd-care-follow-ups";
import type { ShepherdCareFollowUpsRow } from "@/types/database";

// Follow-up statuses on the status vocabulary: overdue = clay (needs
// follow-up), done = sage, in progress = amber (watch), open = neutral.
function statusBadgeTone(
  status: ShepherdCareFollowUpsRow["status"],
  overdue: boolean
): BadgeTone {
  if (overdue) return "clay";
  switch (status) {
    case "done":
      return "sage";
    case "in_progress":
      return "amber";
    case "open":
    default:
      return "neutral";
  }
}

export function CareFollowUpList({
  followUps,
  shepherdProfileId,
  todayIso,
}: {
  followUps: ShepherdCareFollowUpsRow[];
  shepherdProfileId: string;
  todayIso: string;
}) {
  if (followUps.length === 0) {
    return (
      <EmptyState
        variant="inline"
        className="py-5"
        title="No follow-ups yet."
      />
    );
  }
  const ordered = sortFollowUpsByUrgency(followUps, todayIso);
  return (
    <div role="list">
      {ordered.map((row) => {
        const overdue = isFollowUpOverdue(row, todayIso);
        return (
          <div
            key={row.id}
            role="listitem"
            className="border-b border-lineSoft py-3.5"
          >
            <p className="m-0 font-sans text-base font-semibold text-ink [overflow-wrap:anywhere]">
              {row.title}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
              <Badge tone={statusBadgeTone(row.status, overdue)}>
                {overdue
                  ? "Overdue"
                  : shepherdCareFollowUpStatusLabel(row.status)}
              </Badge>
              <span className="font-sans text-sm text-ink2">
                {row.due_date
                  ? `Due ${formatIsoDate(row.due_date)}`
                  : "No due date"}
              </span>
              {row.status === "done" && row.completed_at ? (
                <span className="font-sans text-sm italic text-ink3">
                  Done {formatIsoDate(row.completed_at.slice(0, 10))}
                </span>
              ) : null}
            </div>
            {row.notes ? (
              <p className={`${noteBodyClassName} mt-2`}>{row.notes}</p>
            ) : null}
            <div className="mt-2.5">
              <CareFollowUpStatusControls
                followUpId={row.id}
                followUpTitle={row.title}
                followUpDueDate={row.due_date}
                status={row.status}
                shepherdProfileId={shepherdProfileId}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
