"use client";

import type { ReactNode } from "react";
import { EditingSurface } from "@/components/lg/admin/editing-surface";
import { useEditingDrawer } from "@/components/lg/admin/use-editing-drawer";
import {
  LogTouchForm,
  CareProfileFieldForm,
} from "@/components/admin/shepherd-care/care-action-forms";
import type { ShepherdCareProfilesRow } from "@/types/database";
import type { ShepherdCareInteractionType } from "@/types/enums";
import { Button } from "@/components/ui/button";

// Leader care actions, redesigned as plain, separate choices (#272, Admin
// Interaction Model req 10). Each choice does exactly one thing and opens a
// focused Editing Pattern drawer — Log call/text/visit, Set next touchpoint,
// Update status, Add/Edit summary — instead of the old two dense forms with
// embedded "also update…" and tick-to-change checkboxes. No data-model or
// permission change: the forms reuse the existing log + upsert actions. The
// admin-only nature of everything here is stated on the surface and again in
// each drawer; the encrypted Private Care Note keeps its own separate section
// (it escapes the oversight ladder, super admin included).

type CareActionKind =
  | "log_call"
  | "log_text"
  | "log_visit"
  | "update_status"
  | "set_touchpoint"
  | "edit_summary";

const TOUCH_TYPE: Record<
  "log_call" | "log_text" | "log_visit",
  { type: ShepherdCareInteractionType; touchLabel: string }
> = {
  log_call: { type: "call", touchLabel: "call" },
  log_text: { type: "text", touchLabel: "text" },
  log_visit: { type: "in_person", touchLabel: "visit" },
};

export function CareActions({
  shepherdProfileId,
  current,
  leaderName,
}: {
  shepherdProfileId: string;
  current: ShepherdCareProfilesRow | null;
  // The leader this record is for, so the drawer's Close control carries record
  // context (req 4) rather than a bare "Close".
  leaderName: string;
}) {
  const drawer = useEditingDrawer<CareActionKind>();

  const summaryLabel = current?.admin_summary ? "Edit summary" : "Add summary";

  const actions: { kind: CareActionKind; label: string }[] = [
    { kind: "log_call", label: "Log call" },
    { kind: "log_text", label: "Log text" },
    { kind: "log_visit", label: "Log visit" },
    { kind: "update_status", label: "Update status" },
    { kind: "set_touchpoint", label: "Set next step" },
    { kind: "edit_summary", label: summaryLabel },
  ];

  // Per-action drawer copy + form. Resolved from the open target so a single
  // always-mounted drawer owns the focus trap and focus restore.
  function renderDrawer(): {
    title: string;
    description: string;
    form: ReactNode;
  } | null {
    const kind = drawer.target;
    if (kind === null) return null;

    const shared = {
      shepherdProfileId,
      onCancel: drawer.requestClose,
      onDirty: drawer.markDirty,
      onPendingChange: drawer.reportPending,
      onSaved: drawer.markSaved,
    };

    if (kind === "log_call" || kind === "log_text" || kind === "log_visit") {
      const { type, touchLabel } = TOUCH_TYPE[kind];
      return {
        title: `Log a ${touchLabel}`,
        description: `Record a ${touchLabel} with ${leaderName}. Admin-only. It never appears on shepherd or member surfaces.`,
        form: (
          <LogTouchForm
            {...shared}
            interactionType={type}
            touchLabel={touchLabel}
          />
        ),
      };
    }
    if (kind === "update_status") {
      return {
        title: "Update care status",
        description: `Where ${leaderName} is, from your pastoral view. Admin-only.`,
        form: (
          <CareProfileFieldForm {...shared} field="status" current={current} />
        ),
      };
    }
    if (kind === "set_touchpoint") {
      return {
        title: "Set next step",
        description: `When you'll next reach out to ${leaderName}. Admin-only.`,
        form: (
          <CareProfileFieldForm
            {...shared}
            field="touchpoint"
            current={current}
          />
        ),
      };
    }
    return {
      title: current?.admin_summary
        ? "Edit issue / concern"
        : "Add issue / concern",
      description: `A high-level read on ${leaderName}. Admin-only. It never appears on shepherd or member surfaces.`,
      form: (
        <CareProfileFieldForm {...shared} field="summary" current={current} />
      ),
    };
  }

  const open = renderDrawer();

  // Hierarchy for the action row (design direction §4): the three logging
  // actions read as one related cluster on a surfaceAlt tint; the three
  // record-keeping actions stand apart as plain ghosts. Same six actions,
  // same labels — only the visual grouping changed.
  const logActions = actions.filter((a) => a.kind.startsWith("log_"));
  const editActions = actions.filter((a) => !a.kind.startsWith("log_"));

  return (
    <div className="grid gap-3">
      <p className="m-0 font-sans text-sm text-ink2">
        Pick an action. Each opens a focused panel and does one thing.
        Everything here is admin-only. It never appears on leader or member
        surfaces.
      </p>
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex flex-wrap items-center gap-1.5 rounded-pill bg-surfaceAlt p-1">
          {logActions.map((a) => (
            <Button
              key={a.kind}
              type="button"
              variant="ghost"
              size="md"
              onClick={() => drawer.open(a.kind)}
            >
              {a.label}
            </Button>
          ))}
        </div>
        {editActions.map((a) => (
          <Button
            key={a.kind}
            type="button"
            variant="ghost"
            size="md"
            onClick={() => drawer.open(a.kind)}
          >
            {a.label}
          </Button>
        ))}
      </div>

      {/* One always-mounted drawer (open toggled) so Radix owns the focus trap
          and focus restore, matching the care follow-up create flow (#268). */}
      <EditingSurface
        open={drawer.isOpen}
        onRequestClose={drawer.requestClose}
        eyebrow="Care action"
        title={open?.title ?? ""}
        description={open?.description}
        closeLabel={`Close care action panel for ${leaderName}`}
      >
        {open?.form ?? null}
      </EditingSurface>
      {drawer.discardDialog}
    </div>
  );
}
