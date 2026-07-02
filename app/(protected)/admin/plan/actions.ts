"use server";

import {
  validateCreateProspectPayload,
  validateTransitionProspectPayload,
  validateSetProspectNextStepPayload,
  validateUpdateProspectPayload,
  validateArchiveProspectPayload,
  validateAddGroupTypePayload,
  type CreateProspectPayload,
  type TransitionProspectPayload,
  type SetProspectNextStepPayload,
  type UpdateProspectPayload,
  type ArchiveProspectPayload,
  type AddGroupTypePayload,
} from "@/lib/admin/validation";
import { type ActionResult } from "@/lib/admin/action-result";
import {
  runAdminWriteAction,
  type ActionInput,
  type AdminWriteActionSpec,
} from "@/lib/admin/run-action";
import { adminRpc } from "@/lib/admin/rpc";
import { toRpcArgs } from "@/lib/shared/rpc-args";
import { updateTag } from "next/cache";
import { GROUP_TYPES_CACHE_TAG } from "@/lib/supabase/cached-config";

// The Interest Funnel board reads from /admin/plan; the home dashboard also
// surfaces funnel counts, so it is revalidated too. /admin/multiply's Interest
// pillar counts interested, non-archived prospects by desired cell, so any
// prospect write that can change that set (create / transition / archive)
// refreshes it as well.
const REVALIDATE_PATHS = ["/admin/plan", "/admin", "/admin/multiply"] as const;

const CREATE_PROSPECT_KEYS = [
  "full_name",
  "email",
  "phone",
  "desired_group_type",
] as const;

const TRANSITION_PROSPECT_KEYS = ["prospect_id", "state", "group_id"] as const;

const UPDATE_PROSPECT_KEYS = [
  "prospect_id",
  "full_name",
  "email",
  "phone",
] as const;

const ARCHIVE_PROSPECT_KEYS = ["prospect_id"] as const;

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
    adminRpc(
      client,
      "admin_create_prospect",
      toRpcArgs(value, CREATE_PROSPECT_KEYS)
    ),
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
    adminRpc(client, "admin_transition_prospect", {
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
    adminRpc(client, "admin_set_prospect_next_step", {
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

// ----- adminUpdateProspect ------------------------------------------------
// Correct a Prospect's identity fields (name / email / phone). No state change.

const UPDATE_PROSPECT_SPEC: AdminWriteActionSpec<
  UpdateProspectPayload,
  { id: string }
> = {
  name: "admin.plan.update_prospect",
  keys: UPDATE_PROSPECT_KEYS,
  validate: validateUpdateProspectPayload,
  fields: (_actor, value) => ({ target_prospect_id: value.prospect_id }),
  okFields: (value) => ({
    has_email: value.email !== null,
    has_phone: value.phone !== null,
  }),
  rpc: (client, value) =>
    adminRpc(
      client,
      "admin_update_prospect",
      toRpcArgs(value, UPDATE_PROSPECT_KEYS)
    ),
  revalidate: () => REVALIDATE_PATHS,
  noDataError: "The prospect wasn't updated. Please try again.",
};

export async function adminUpdateProspect(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<UpdateProspectPayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(UPDATE_PROSPECT_SPEC, prev, input);
}

// ----- adminArchiveProspect -----------------------------------------------
// Soft-archive a Prospect (cleanup). The board read drops archived non-joined
// rows entirely, so it leaves the board (and is not shown in the Joined roll-up).

const ARCHIVE_PROSPECT_SPEC: AdminWriteActionSpec<
  ArchiveProspectPayload,
  { id: string }
> = {
  name: "admin.plan.archive_prospect",
  keys: ARCHIVE_PROSPECT_KEYS,
  validate: validateArchiveProspectPayload,
  fields: (_actor, value) => ({ target_prospect_id: value.prospect_id }),
  rpc: (client, value) =>
    adminRpc(client, "admin_archive_prospect", {
      p_prospect_id: value.prospect_id,
    }),
  revalidate: () => REVALIDATE_PATHS,
  noDataError: "The prospect wasn't archived. Please try again.",
};

export async function adminArchiveProspect(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<ArchiveProspectPayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(ARCHIVE_PROSPECT_SPEC, prev, input);
}

// ----- adminAddGroupType (#747) -------------------------------------------
// Inline "add new type" from the Prospect desired-type picker: idempotently
// append one new free-text type to the canonical group_types list, so Julian is
// never blocked when the type he wants isn't in the dropdown yet. The list is
// global config read on many surfaces (Settings, group editor, Multiply), so a
// successful add busts the cross-request cache tag — mirroring adminSetGroupTypes
// in the settings actions.
const ADD_GROUP_TYPE_SPEC: AdminWriteActionSpec<
  AddGroupTypePayload,
  { id: string }
> = {
  name: "admin.plan.add_group_type",
  keys: ["group_type"],
  validate: validateAddGroupTypePayload,
  rpc: (client, value) =>
    adminRpc(client, "admin_add_group_type", { p_group_type: value.groupType }),
  // The new type shows up across surfaces that list the canonical types.
  revalidate: () => REVALIDATE_PATHS,
  noDataError: "The group type wasn't added. Please try again.",
};

export async function adminAddGroupType(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<AddGroupTypePayload>
): Promise<ActionResult<{ id: string }>> {
  const result = await runAdminWriteAction(ADD_GROUP_TYPE_SPEC, prev, input);
  // group_types is cached cross-request (lib/supabase/cached-config.ts); bust the
  // tag so the appended type is reflected on the next read everywhere.
  if (result.ok) updateTag(GROUP_TYPES_CACHE_TAG);
  return result;
}
