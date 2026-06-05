"use server";

import {
  validateCreateProspectPayload,
  validateTransitionProspectPayload,
  type CreateProspectPayload,
  type TransitionProspectPayload,
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
} from "@/lib/admin/rpc";

// The Interest Funnel board reads from /admin/plan; the home dashboard also
// surfaces funnel counts, so it is revalidated too.
const REVALIDATE_PATHS = ["/admin/plan", "/admin"] as const;

const CREATE_PROSPECT_KEYS = ["full_name", "email", "phone"] as const;

const TRANSITION_PROSPECT_KEYS = ["prospect_id", "state", "group_id"] as const;

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
