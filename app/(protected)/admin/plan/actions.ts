"use server";

import {
  validateCreateProspectPayload,
  validateTransitionProspectPayload,
  validateSetProspectNextStepPayload,
  type CreateProspectPayload,
  type TransitionProspectPayload,
  type SetProspectNextStepPayload,
} from "@/lib/admin/validation";
import { type ActionResult } from "@/lib/admin/action-result";
import {
  runAdminWriteAction,
  type ActionInput,
  type AdminWriteActionSpec,
} from "@/lib/admin/run-action";
import {
  rpcAdminCreateProspect,
  rpcAdminTransitionProspect,
  rpcAdminSetProspectNextStep,
} from "@/lib/admin/rpc";

// The Interest Funnel board reads from /admin/plan; the home dashboard also
// surfaces funnel counts, so it is revalidated too.
const REVALIDATE_PATHS = ["/admin/plan", "/admin"] as const;

const CREATE_PROSPECT_KEYS = [
  "full_name",
  "email",
  "phone",
  // #399: the desired (top type × category) cell named at intake.
  "desired_audience_category",
  "desired_category_id",
] as const;

const TRANSITION_PROSPECT_KEYS = ["prospect_id", "state", "group_id"] as const;

const SET_NEXT_STEP_KEYS = [
  "prospect_id",
  "next_step_type",
  "next_step_due_date",
  "next_step_detail",
  "additional_note",
] as const;

// ----- adminCreateProspect ------------------------------------------------

const CREATE_PROSPECT_SPEC: AdminWriteActionSpec<
  CreateProspectPayload,
  { id: string }
> = {
  name: "admin.plan.create_prospect",
  keys: CREATE_PROSPECT_KEYS,
  validate: validateCreateProspectPayload,
  okFields: (_value, id) => ({ new_prospect_id: id }),
  rpc: (client, value) =>
    rpcAdminCreateProspect(client, {
      p_full_name: value.full_name,
      p_email: value.email,
      p_phone: value.phone,
      p_desired_audience_category: value.desired_audience_category,
      p_desired_category_id: value.desired_category_id,
    }),
  revalidate: () => REVALIDATE_PATHS,
  noDataError: "The prospect wasn't saved. Please try again.",
};

export async function adminCreateProspect(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<CreateProspectPayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(CREATE_PROSPECT_SPEC, prev, input);
}

// ----- adminTransitionProspect --------------------------------------------

const TRANSITION_PROSPECT_SPEC: AdminWriteActionSpec<
  TransitionProspectPayload,
  { id: string }
> = {
  name: "admin.plan.transition_prospect",
  keys: TRANSITION_PROSPECT_KEYS,
  validate: validateTransitionProspectPayload,
  fields: (_actor, value) => ({ target_prospect_id: value.prospect_id }),
  okFields: (value) => ({ state: value.state }),
  rpc: (client, value) =>
    rpcAdminTransitionProspect(client, {
      p_prospect_id: value.prospect_id,
      p_state: value.state,
      p_group_id: value.group_id,
    }),
  revalidate: () => REVALIDATE_PATHS,
  noDataError: "The prospect wasn't updated. Please try again.",
};

export async function adminTransitionProspect(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<TransitionProspectPayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(TRANSITION_PROSPECT_SPEC, prev, input);
}

// ----- adminSetProspectNextStep (#379) ------------------------------------
// Sets a Prospect's single current Next Step + separate Additional Note. A
// follow_up with a due date is an armed follow-up (surfaced as a due task). No
// provider is wired — nothing is sent. The audit (in the RPC) records presence
// flags only, so the action's log fields stay presence-only too.

const SET_NEXT_STEP_SPEC: AdminWriteActionSpec<
  SetProspectNextStepPayload,
  { id: string }
> = {
  name: "admin.plan.set_prospect_next_step",
  keys: SET_NEXT_STEP_KEYS,
  validate: validateSetProspectNextStepPayload,
  fields: (_actor, value) => ({ target_prospect_id: value.prospect_id }),
  okFields: (value) => ({
    next_step_type: value.next_step?.type ?? null,
    has_due_date: value.next_step?.due_date != null,
    has_detail: value.next_step?.detail != null,
    has_note: value.additional_note != null,
  }),
  rpc: (client, value) =>
    rpcAdminSetProspectNextStep(client, {
      p_prospect_id: value.prospect_id,
      p_next_step: value.next_step,
      p_additional_note: value.additional_note,
    }),
  revalidate: () => REVALIDATE_PATHS,
  noDataError: "The next step wasn't saved. Please try again.",
};

export async function adminSetProspectNextStep(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<SetProspectNextStepPayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(SET_NEXT_STEP_SPEC, prev, input);
}
