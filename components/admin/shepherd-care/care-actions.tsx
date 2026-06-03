"use client";

import type { ReactNode } from "react";
import { PButton } from "@/components/pastoral/button";
import { EditingSurface } from "@/components/lg/admin/editing-surface";
import { useEditingDrawer } from "@/components/lg/admin/use-editing-drawer";
import {
  LogTouchForm,
  CareProfileFieldForm,
} from "@/components/admin/shepherd-care/care-action-forms";
import { P, fontBody } from "@/lib/pastoral";
import type { ShepherdCareProfilesRow } from "@/types/database";
import type { ShepherdCareInteractionType } from "@/types/enums";

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
    { kind: "set_touchpoint", label: "Set next touchpoint" },
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
        description: `Record a ${touchLabel} with ${leaderName}. Admin-only — never shown on leader or member surfaces.`,
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
        title: "Set next touchpoint",
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
        ? "Edit admin summary"
        : "Add admin summary",
      description: `A high-level read on ${leaderName}. Admin-only — never shown on leader or member surfaces.`,
      form: (
        <CareProfileFieldForm {...shared} field="summary" current={current} />
      ),
    };
  }

  const open = renderDrawer();

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <p
        style={{
          fontFamily: fontBody,
          fontSize: 13,
          color: P.ink2,
          margin: 0,
        }}
      >
        Pick an action. Each opens a focused panel and does one thing.
        Everything here is admin-only — it never appears on leader or member
        surfaces.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {actions.map((a) => (
          <PButton
            key={a.kind}
            type="button"
            tone="ghost"
            size="md"
            onClick={() => drawer.open(a.kind)}
          >
            {a.label}
          </PButton>
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
    </div>
  );
}
