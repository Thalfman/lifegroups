"use client";

import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { PBadge, type PTone } from "@/components/pastoral/atoms";
import { PLinkButton } from "@/components/pastoral/button";
import { dateLabel, formatClock } from "@/lib/calendar/occurrences";
import {
  friendlyEventStatusLabel,
  friendlyEventTypeLabel,
} from "@/lib/calendar/payload";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import type { MasterOccurrence } from "@/lib/admin/master-calendar";

function statusTone(status: MasterOccurrence["status"]): PTone {
  if (status === "off") return "pause";
  if (status === "cancelled") return "followup";
  return "healthy";
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
            background: "rgba(58, 42, 26, 0.45)",
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
            background: P.bg,
            border: `1px solid ${P.line}`,
            borderRadius: 14,
            padding: 0,
            zIndex: 61,
            boxShadow: "0 18px 48px rgba(58, 42, 26, 0.22)",
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
  const tone = statusTone(occurrence.status);
  const sourceLabel = occurrence.isGenerated ? "Generated" : "Override";
  const groupCalendarHref = `/admin/groups/${occurrence.groupId}/calendar?month=${monthIso}`;
  const groupDetailHref = `/admin/groups/${occurrence.groupId}`;

  return (
    <>
      <header
        style={{
          padding: "18px 20px",
          borderBottom: `1px solid ${P.line}`,
          background: P.surface,
          display: "grid",
          gap: 6,
          position: "relative",
        }}
      >
        <DialogTitle
          style={{
            fontFamily: fontSans,
            fontSize: 11,
            letterSpacing: 1.8,
            textTransform: "uppercase",
            color: P.ink3,
            fontWeight: 700,
            margin: 0,
          }}
        >
          {dateLabel(occurrence.date)}
        </DialogTitle>
        <DialogDescription
          style={{
            fontFamily: fontBody,
            fontSize: 18,
            fontWeight: 600,
            color: P.ink,
            margin: 0,
            lineHeight: 1.3,
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
            background: "transparent",
            border: `1px solid ${P.line}`,
            borderRadius: 999,
            width: 32,
            height: 32,
            cursor: "pointer",
            color: P.ink2,
            fontFamily: fontSans,
            fontSize: 18,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </header>

      <div style={{ padding: "18px 20px", display: "grid", gap: 14 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {occurrence.status !== "scheduled" ? (
            <PBadge tone={tone}>{friendlyEventStatusLabel(occurrence.status)}</PBadge>
          ) : (
            <PBadge tone="healthy">{typeLabel}</PBadge>
          )}
          <PBadge tone="neutral">{sourceLabel}</PBadge>
          {!occurrence.isMeetingOccurrence ? (
            <PBadge tone="watch">Special</PBadge>
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
          borderTop: `1px solid ${P.line}`,
          background: P.surface,
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
  // Multiline values (today: Description only) read as quoted notes —
  // 2px line on the left, italic body, slightly muted ink. Keeps prose
  // visually distinct from short factual fields above it.
  const multilineStyle = multiline
    ? {
        borderLeft: `2px solid ${P.line}`,
        paddingLeft: 10,
        color: P.ink2,
        fontStyle: "italic" as const,
      }
    : {};
  return (
    <div style={{ display: "grid", gap: 3 }}>
      <span
        style={{
          fontFamily: fontSans,
          fontSize: 10,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: P.ink3,
          fontWeight: 700,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: fontBody,
          fontSize: 14,
          color: P.ink,
          lineHeight: 1.45,
          whiteSpace: multiline ? "pre-wrap" : "normal",
          ...multilineStyle,
        }}
      >
        {value}
      </span>
    </div>
  );
}
