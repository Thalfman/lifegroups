"use client";

import { PBadge } from "@/components/pastoral/atoms";
import { EmptyState, StatusCard } from "@/components/dashboard/cards";
import {
  followUpPriorityLabel,
  followUpTypeLabel,
} from "@/lib/dashboard/labels";
import { cn } from "@/lib/utils";
import { LeaderFollowUpStatusButton } from "./leader-follow-up-status-button";
import type { FollowUpPriority, FollowUpStatus } from "@/types/enums";

/**
 * Leader-facing follow-up view model. Privacy boundary: this type
 * intentionally exposes only `leaderVisibleNote` and has **no**
 * `adminPrivateNote` / `admin_private_note` field. The mapping from
 * `LeaderFollowUpRow` to this shape in `app/(protected)/leader/page.tsx`
 * never reads `admin_private_note`, and the upstream reader
 * (`fetchFollowUpsForLeader`) does not select the column. Keep this type
 * narrow — see `docs/PHASE_5C_1_PRIVACY_HARDENING.md`.
 */
export type LeaderFollowUpItem = {
  id: string;
  title: string;
  type: import("@/types/enums").FollowUpType;
  priority: FollowUpPriority;
  status: FollowUpStatus;
  dueDate: string | null;
  relatedGroupId: string | null;
  relatedGroupName: string | null;
  relatedGuestId: string | null;
  relatedGuestName: string | null;
  leaderVisibleNote: string | null;
};

const STATUS_LABEL: Record<FollowUpStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
  snoozed: "Snoozed",
};

export function LeaderFollowUpsSection({
  items,
}: {
  items: LeaderFollowUpItem[];
}) {
  const active = items.filter(
    (i) => i.status === "open" || i.status === "in_progress"
  );
  const recentlyDone = items.filter((i) => i.status === "done").slice(0, 4);

  return (
    <StatusCard title="Follow-ups" eyebrow="Threads to close out">
      {active.length === 0 ? (
        <EmptyState
          title="No follow-ups right now"
          description="When an admin assigns a follow-up to you or to a group you lead, it'll show up here."
        />
      ) : (
        <ul className="m-0 list-none p-0">
          {active.map((item, i, arr) => (
            <li
              key={item.id}
              className={cn(
                "py-3.5",
                i < arr.length - 1 && "border-b border-lineSoft"
              )}
            >
              <LeaderFollowUpRow item={item} />
            </li>
          ))}
        </ul>
      )}
      {recentlyDone.length > 0 ? (
        <details className="mt-3.5">
          <summary className="cursor-pointer font-sans text-sm font-medium text-ink3">
            Recently closed ({recentlyDone.length})
          </summary>
          <ul className="m-0 mt-2.5 list-none p-0">
            {recentlyDone.map((item, i, arr) => (
              <li
                key={item.id}
                className={cn(
                  "py-2.5",
                  i < arr.length - 1 && "border-b border-lineSoft"
                )}
              >
                <div className="font-sans text-sm italic text-ink2">
                  {item.title}
                </div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </StatusCard>
  );
}

function LeaderFollowUpRow({ item }: { item: LeaderFollowUpItem }) {
  const guestLabel = item.relatedGuestId
    ? (item.relatedGuestName ?? "Guest")
    : null;
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <div className="min-w-0">
          <div className="font-sans text-base font-medium text-ink">
            {item.title}
          </div>
          <div className="mt-1 flex flex-wrap gap-2 font-sans text-sm text-ink3">
            <span>{followUpTypeLabel(item.type)}</span>
            <span>· {STATUS_LABEL[item.status]}</span>
            {item.dueDate ? <span>· Due {item.dueDate}</span> : null}
          </div>
          {(item.relatedGroupName || guestLabel) && (
            <div className="mt-1 flex flex-wrap gap-2.5 font-sans text-sm text-ink2">
              {item.relatedGroupName ? (
                <span>Group: {item.relatedGroupName}</span>
              ) : null}
              {guestLabel ? <span>Guest: {guestLabel}</span> : null}
            </div>
          )}
        </div>
        <PBadge tone={priorityTone(item.priority)}>
          {followUpPriorityLabel(item.priority)}
        </PBadge>
      </div>
      {item.leaderVisibleNote ? (
        // In-card grouping carries the note on a surfaceAlt tint — the old
        // sage side-stripe is restructured away, not recolored.
        <blockquote className="m-0 rounded-sm bg-surfaceAlt px-3.5 py-2.5 font-sans text-sm italic leading-relaxed text-ink">
          {item.leaderVisibleNote}
        </blockquote>
      ) : null}
      <LeaderFollowUpStatusButton followUpId={item.id} status={item.status} />
    </div>
  );
}

function priorityTone(priority: FollowUpPriority) {
  if (priority === "high") return "followup" as const;
  if (priority === "normal") return "watch" as const;
  return "neutral" as const;
}
