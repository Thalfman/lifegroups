"use client";

import { useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { PBadge } from "@/components/pastoral/atoms";
import { dateLabel, formatClock } from "@/lib/calendar/occurrences";
import {
  friendlyEventStatusLabel,
  friendlyEventTypeLabel,
} from "@/lib/calendar/payload";
import { cn } from "@/lib/utils";
import type { MasterOccurrence } from "@/lib/admin/master-calendar";
import { occurrenceStatusTone } from "./admin-master-calendar-status";
import { LinkButton } from "@/components/ui/button";

export function AdminMasterCalendarDrawer({
  monthIso,
  occurrence,
  onClose,
}: {
  monthIso: string;
  occurrence: MasterOccurrence | null;
  onClose: () => void;
}) {
  const open = occurrence !== null;
  // The occurrence row that had focus when the drawer opened, so we return focus
  // to it on close. The drawer is opened programmatically by selecting a row
  // (no DialogTrigger), so Radix has no trigger to auto-restore to — own it here
  // as the EditingSurface and the occurrence editor do.
  const openerRef = useRef<HTMLElement | null>(null);
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-overlay bg-[rgba(58,42,26,0.45)]" />
        <DialogContent
          onOpenAutoFocus={() => {
            openerRef.current = document.activeElement as HTMLElement | null;
          }}
          onCloseAutoFocus={(event) => {
            const opener = openerRef.current;
            if (opener && document.contains(opener)) {
              event.preventDefault();
              opener.focus();
            }
          }}
          className="lg-m-master-calendar-drawer fixed left-1/2 top-1/2 z-drawer flex max-h-[92dvh] w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto rounded-lg border border-line bg-bg p-0 shadow-[0_18px_48px_rgba(58,42,26,0.22)]"
        >
          {occurrence ? (
            <DrawerBody
              occurrence={occurrence}
              monthIso={monthIso}
              onClose={onClose}
            />
          ) : (
            <DialogTitle className="hidden">Occurrence details</DialogTitle>
          )}
        </DialogContent>
      </DialogPortal>
    </Dialog>
  );
}

function DrawerBody({
  occurrence,
  monthIso,
  onClose,
}: {
  occurrence: MasterOccurrence;
  monthIso: string;
  onClose: () => void;
}) {
  const clock = formatClock(occurrence.inheritedMeetingTime);
  const typeLabel = friendlyEventTypeLabel(occurrence.eventType);
  const tone = occurrenceStatusTone(occurrence.status);
  const sourceLabel = occurrence.isGenerated ? "Generated" : "Override";
  const groupCalendarHref = `/admin/groups/${occurrence.groupId}/calendar?month=${monthIso}`;
  const groupDetailHref = `/admin/groups/${occurrence.groupId}`;

  return (
    <>
      <header className="relative grid gap-1.5 border-b border-line bg-surface px-5 py-[18px]">
        <DialogTitle className="m-0 font-sans text-2xs font-bold uppercase tracking-[1.8px] text-ink3">
          {dateLabel(occurrence.date)}
        </DialogTitle>
        <DialogDescription className="m-0 font-sans text-[18px] font-semibold leading-[1.3] text-ink">
          {occurrence.groupName}
        </DialogDescription>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-2.5 top-2.5 h-8 w-8 cursor-pointer rounded-pill border border-line bg-transparent font-sans text-[18px] leading-none text-ink2"
        >
          ×
        </button>
      </header>

      <div className="grid gap-3.5 px-5 py-[18px]">
        <div className="flex flex-wrap gap-2">
          {occurrence.status !== "scheduled" ? (
            <PBadge tone={tone}>
              {friendlyEventStatusLabel(occurrence.status)}
            </PBadge>
          ) : (
            <PBadge tone="healthy">{typeLabel}</PBadge>
          )}
          <PBadge tone="neutral">{sourceLabel}</PBadge>
          {!occurrence.isMeetingOccurrence ? (
            <PBadge tone="watch">Special</PBadge>
          ) : null}
        </div>

        <Field label="Gathering type" value={typeLabel} />
        <Field
          label="Status"
          value={friendlyEventStatusLabel(occurrence.status)}
        />
        <Field
          label="Meeting time (inherited from group)"
          value={clock ?? "Not set on the group schedule"}
        />
        <Field
          label="Shepherd / co-shepherd"
          value={
            occurrence.leaders.length > 0
              ? occurrence.leaders.map((l) => l.name).join(", ")
              : "Unassigned"
          }
        />
        {occurrence.title ? (
          <Field label="Title" value={occurrence.title} />
        ) : null}
        {occurrence.description ? (
          <Field label="Description" value={occurrence.description} multiline />
        ) : null}
      </div>

      <footer className="flex flex-wrap justify-end gap-2.5 border-t border-line bg-surface px-5 py-3.5">
        <LinkButton
          href={groupDetailHref}
          variant="ghost"
          size="sm"
          aria-label={`View ${occurrence.groupName} group`}
        >
          View group
        </LinkButton>
        <LinkButton
          href={groupCalendarHref}
          variant="primary"
          size="sm"
          aria-label={`Open ${occurrence.groupName} calendar — ${dateLabel(occurrence.date)}`}
        >
          Open group calendar
        </LinkButton>
      </footer>
    </>
  );
}

function Field({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  // Multiline values (today: Description only) read as quoted notes —
  // 2px line on the left, italic body, slightly muted ink. Keeps prose
  // visually distinct from short factual fields above it.
  return (
    <div className="grid gap-[3px]">
      <span className="font-sans text-[10px] font-bold uppercase tracking-[1.2px] text-ink3">
        {label}
      </span>
      <span
        className={cn(
          "font-sans text-base leading-[1.45] text-ink",
          multiline &&
            "whitespace-pre-wrap border-l-2 border-line pl-2.5 italic text-ink2"
        )}
      >
        {value}
      </span>
    </div>
  );
}
