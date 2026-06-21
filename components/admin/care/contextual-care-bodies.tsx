"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { ContextualBodyProps } from "@/components/lg/admin/contextual-action-provider";
import type { ContextualActionBodyKey } from "@/lib/admin/contextual-actions";
import { CareNoteWriteForm } from "@/components/admin/shepherd-care/care-note-write-form";
import {
  LogTouchForm,
  CareProfileFieldForm,
} from "@/components/admin/shepherd-care/care-action-forms";
import { CareFollowUpCreateForm } from "@/components/admin/shepherd-care/care-follow-up-create-form";
import { resolveCareProfileId } from "@/app/(protected)/admin/shepherd-care/care-profile-resolve";
import type { ShepherdCareInteractionType } from "@/types/enums";

// The Care contextual drawer bodies (#776 Phase 1, OPP-1). Each render-fn wires
// an EXISTING care form into the shared contextual host: the host hands it the
// leader entity + the drawer controls, and the body forwards those controls to
// the form's onSaved/onDirty/onPendingChange/onCancel. No new write path — every
// body posts through the same audited server action the detail page uses.
//
// Data contract: the host passes only { entity:{kind,id,label}, action, controls }.
// `entity.id` is the leader's profile id (which is the `shepherd_profile_id` /
// `subject_profile_id` every Care write keys on); `entity.label` is the leader's
// name. The touchpoint form opens with `current={null}` (the accordion / feed
// models don't carry the care row); that's safe because its date field is
// required-and-empty, so there is no silent default to clobber — the user must
// pick the next-step date, which is the action's whole purpose. (An "Update
// status" action is deliberately NOT offered here: with no current row its
// select would default to "doing_well" and a careless save could downgrade a
// leader flagged concern/needs_follow_up — that edit stays on the leader detail
// page, which prefills the real status.)

// The log_* actions share one body; map the chosen action id → interaction type
// + lower-case noun, exactly as `care-actions.tsx` does on the detail page.
const TOUCH_BY_ACTION_ID: Record<
  string,
  { type: ShepherdCareInteractionType; touchLabel: string }
> = {
  log_call: { type: "call", touchLabel: "call" },
  log_text: { type: "text", touchLabel: "text" },
  log_visit: { type: "in_person", touchLabel: "visit" },
};

// "Create follow-up" needs a `care_profile_id`, not the leader profile id. This
// resolver reads (never assumes) the leader's care profile id on open: if it
// exists, the follow-up form renders against it; if not, it explains that a
// care profile must be started first (mirroring the detail page) rather than
// silently writing one. The leader id is never passed as the care-profile id.
function CareFollowUpResolverBody({ entity, controls }: ContextualBodyProps) {
  const shepherdProfileId = entity.id;
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; careProfileId: string }
    | { kind: "missing" }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  // Resolve once on open. The body mounts fresh each time the drawer opens (the
  // host renders it only while its action is active), so the initial "loading"
  // state already covers the reset — no synchronous setState needed here.
  useEffect(() => {
    let active = true;
    resolveCareProfileId(shepherdProfileId)
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setState({ kind: "error", message: result.error });
        } else if (result.id === null) {
          setState({ kind: "missing" });
        } else {
          setState({ kind: "ready", careProfileId: result.id });
        }
      })
      .catch(() => {
        if (!active) return;
        setState({
          kind: "error",
          message: "Couldn't load this shepherd's care profile. Try again.",
        });
      });
    return () => {
      active = false;
    };
  }, [shepherdProfileId]);

  if (state.kind === "loading") {
    return <p className="m-0 font-sans text-sm text-ink2">Preparing…</p>;
  }
  if (state.kind === "error") {
    return (
      <p
        role="alert"
        className="m-0 rounded-md bg-claySoft px-3.5 py-2.5 font-sans text-sm text-clayDeep"
      >
        {state.message}
      </p>
    );
  }
  if (state.kind === "missing") {
    return (
      <p className="m-0 font-sans text-sm leading-normal text-ink2">
        Log an interaction or set the care profile first to start adding
        follow-ups for {entity.label ?? "this shepherd"}.
      </p>
    );
  }
  return (
    <CareFollowUpCreateForm
      careProfileId={state.careProfileId}
      shepherdProfileId={shepherdProfileId}
      onSaved={controls.markSaved}
      onDirty={controls.markDirty}
      onPendingChange={controls.reportPending}
      onCancel={controls.requestClose}
    />
  );
}

// The render-fn map the admin host registers. Keys mirror the registry's
// ContextualActionBodyKey union (the group_editor body is registered separately
// in the host).
export const CARE_CONTEXTUAL_BODIES: Partial<
  Record<ContextualActionBodyKey, (props: ContextualBodyProps) => ReactNode>
> = {
  care_note_writer: ({ entity, controls }) => (
    <CareNoteWriteForm
      subjectProfileId={entity.id}
      subjectName={entity.label}
      kind="care_note"
      // The accordion may already host an inline note form for this same leader
      // (both panels stay mounted in the Care shell), so namespace the drawer
      // instance's field ids to avoid a duplicate-id / wrong-label collision.
      idNamespace="ctx"
      onSaved={controls.markSaved}
      onDirty={controls.markDirty}
      onPendingChange={controls.reportPending}
      onCancel={controls.requestClose}
    />
  ),
  prayer_request_writer: ({ entity, controls }) => (
    <CareNoteWriteForm
      subjectProfileId={entity.id}
      subjectName={entity.label}
      kind="prayer_request"
      idNamespace="ctx"
      onSaved={controls.markSaved}
      onDirty={controls.markDirty}
      onPendingChange={controls.reportPending}
      onCancel={controls.requestClose}
    />
  ),
  care_log_touch: ({ entity, action, controls }) => {
    const touch = TOUCH_BY_ACTION_ID[action.id] ?? TOUCH_BY_ACTION_ID.log_call;
    return (
      <LogTouchForm
        shepherdProfileId={entity.id}
        interactionType={touch.type}
        touchLabel={touch.touchLabel}
        onSaved={controls.markSaved}
        onDirty={controls.markDirty}
        onPendingChange={controls.reportPending}
        onCancel={controls.requestClose}
      />
    );
  },
  care_set_touchpoint: ({ entity, controls }) => (
    <CareProfileFieldForm
      shepherdProfileId={entity.id}
      field="touchpoint"
      current={null}
      onSaved={controls.markSaved}
      onDirty={controls.markDirty}
      onPendingChange={controls.reportPending}
      onCancel={controls.requestClose}
    />
  ),
  care_create_follow_up: (props) => <CareFollowUpResolverBody {...props} />,
};
