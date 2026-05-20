"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pill, type PillTone } from "@/components/pastoral/primitives";
import { PLinkButton } from "@/components/pastoral/button";
import { dateLabel, formatClock } from "@/lib/calendar/occurrences";
import {
  friendlyEventStatusLabel,
  friendlyEventTypeLabel,
} from "@/lib/calendar/payload";
import type { MasterOccurrence } from "@/lib/admin/master-calendar";

function statusPillTone(status: MasterOccurrence["status"]): PillTone {
  if (status === "off") return "neutral";
  if (status === "cancelled") return "clay";
  return "sage";
}

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
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogPortal>
        <DialogOverlay
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(60, 45, 30, 0.38)",
            zIndex: 60,
          }}
        />
        <DialogContent
          aria-describedby={undefined}
          className="lg-m-master-calendar-drawer"
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "min(560px, 92vw)",
            maxHeight: "92dvh",
            overflowY: "auto",
            background: "var(--c-surface)",
            border: "1px solid var(--c-line)",
            borderRadius: 14,
            padding: 0,
            zIndex: 61,
            boxShadow: "var(--c-shadowLg)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {occurrence ? (
            <DrawerBody occurrence={occurrence} monthIso={monthIso} onClose={onClose} />
          ) : (
            <DialogTitle style={{ display: "none" }}>Occurrence details</DialogTitle>
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
  const sourceLabel = occurrence.isGenerated ? "Generated" : "Override";
  const groupCalendarHref = `/admin/groups/${occurrence.groupId}/calendar?month=${monthIso}`;
  const groupDetailHref = `/admin/groups/${occurrence.groupId}`;

  return (
    <>
      <header
        style={{
          padding: "18px 20px",
          borderBottom: "1px solid var(--c-line)",
          background: "var(--c-surfaceAlt)",
          display: "grid",
          gap: 6,
          position: "relative",
        }}
      >
        <DialogTitle
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 11,
            letterSpacing: 1.8,
            textTransform: "uppercase",
            color: "var(--c-ink3)",
            fontWeight: 600,
            margin: 0,
          }}
        >
          {dateLabel(occurrence.date)}
        </DialogTitle>
        <DialogDescription
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 22,
            fontWeight: 500,
            color: "var(--c-ink)",
            margin: 0,
            lineHeight: 1.2,
            letterSpacing: -0.3,
          }}
        >
          {occurrence.groupName}
        </DialogDescription>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            background: "var(--c-surface)",
            border: "1px solid var(--c-line)",
            borderRadius: 999,
            width: 32,
            height: 32,
            cursor: "pointer",
            color: "var(--c-ink2)",
            fontFamily: "var(--font-body)",
            fontSize: 14,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </header>

      <div style={{ padding: "18px 20px", display: "grid", gap: 14 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {occurrence.status !== "scheduled" ? (
            <Pill tone={statusPillTone(occurrence.status)} size="lg">
              {friendlyEventStatusLabel(occurrence.status)}
            </Pill>
          ) : (
            <Pill tone="sage" size="lg">
              {typeLabel}
            </Pill>
          )}
          <Pill tone="neutral" size="lg">
            {sourceLabel}
          </Pill>
          {!occurrence.isMeetingOccurrence ? (
            <Pill tone="amber" size="lg">
              Special
            </Pill>
          ) : null}
        </div>

        <Field label="Gathering type" value={typeLabel} />
        <Field label="Status" value={friendlyEventStatusLabel(occurrence.status)} />
        <Field
          label="Meeting time (inherited from group)"
          value={clock ?? "Not set on the group schedule"}
        />
        <Field
          label="Leader / co-leader"
          value={
            occurrence.leaders.length > 0
              ? occurrence.leaders.map((l) => l.name).join(", ")
              : "Unassigned"
          }
        />
        {occurrence.title ? <Field label="Title" value={occurrence.title} /> : null}
        {occurrence.description ? (
          <Field label="Description" value={occurrence.description} multiline />
        ) : null}
      </div>

      <footer
        style={{
          borderTop: "1px solid var(--c-line)",
          background: "var(--c-surfaceAlt)",
          padding: "14px 20px",
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          justifyContent: "flex-end",
        }}
      >
        <PLinkButton href={groupDetailHref} tone="ghost" size="sm">
          View group
        </PLinkButton>
        <PLinkButton href={groupCalendarHref} tone="terra" size="sm">
          Open group calendar
        </PLinkButton>
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
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <span
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 10.5,
          letterSpacing: 1.4,
          textTransform: "uppercase",
          color: "var(--c-ink3)",
          fontWeight: 600,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 14,
          color: "var(--c-ink)",
          lineHeight: 1.5,
          whiteSpace: multiline ? "pre-wrap" : "normal",
        }}
      >
        {value}
      </span>
    </div>
  );
}
