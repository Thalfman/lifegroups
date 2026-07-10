"use server";

// Canonical home — do NOT retire or warn-log on invoke (ADR 0033). Although this
// file lives in the pre-pivot-named /admin/shepherd-care folder, these actions
// are imported by the canonical Care surface (components/admin/shepherd-care/*),
// so any deprecation here would fire on canonical use.

// Subject scoping is enforced by the RPC + RLS (over_shepherd coverage /
// auth_is_admin), not a client-side `guard`. If a scoped admin tier ever lands,
// add a `guard` to the subject-scoped specs so an out-of-coverage target is a
// clean logged denial rather than a generic RPC error (ARCH-5).

import {
  validateAddPrivateNoteKeySlotPayload,
  validateAssignShepherdCoveragePayload,
  validateCreateOverShepherdPayload,
  validateEndShepherdCoverageAssignmentPayload,
  validateEnrollPrivateNoteKeysPayload,
  validateRemovePrivateNoteKeySlotPayload,
  validateRotatePrivateNoteRecoveryPayload,
  validateSetOverShepherdActivePayload,
  validateUpdateOverShepherdPayload,
  validateUpsertShepherdCarePrivateNotePayload,
  type AddPrivateNoteKeySlotPayload,
  type AssignShepherdCoveragePayload,
  type CreateOverShepherdPayload,
  type EndShepherdCoverageAssignmentPayload,
  type EnrollPrivateNoteKeysPayload,
  type RemovePrivateNoteKeySlotPayload,
  type RotatePrivateNoteRecoveryPayload,
  type SetOverShepherdActivePayload,
  type UpdateOverShepherdPayload,
  type UpsertShepherdCarePrivateNotePayload,
} from "@/lib/admin/validation";
import { type ActionResult } from "@/lib/admin/action-result";
import {
  runAdminWriteAction,
  type ActionInput,
  type AdminWriteActionSpec,
} from "@/lib/admin/run-action";
import { adminRpc } from "@/lib/admin/rpc";
import { toRpcArgs } from "@/lib/shared/rpc-args";

// Form-key lists double as toRpcArgs key lists where they match the RPC's
// p_* args exactly; specs whose form carries extra revalidation-only fields
// (shepherd_profile_id) declare a dedicated *_ARG_KEYS const instead.

// Pulls the optional shepherd_profile_id off the raw form so the care-detail
// page revalidates after a private-note write. The RPC never sees it.
function revalidateShepherdFromRaw(raw: Record<string, unknown>): string[] {
  const shepherdProfileId =
    typeof raw.shepherd_profile_id === "string"
      ? raw.shepherd_profile_id
      : undefined;
  return shepherdCarePaths(shepherdProfileId);
}

const CREATE_OVER_SHEPHERD_KEYS = [
  "full_name",
  "email",
  "phone",
  "notes",
] as const;

const UPDATE_OVER_SHEPHERD_KEYS = [
  "over_shepherd_id",
  "full_name",
  "email",
  "phone",
  "notes",
  "active",
] as const;

const SET_OVER_SHEPHERD_ACTIVE_KEYS = ["over_shepherd_id", "active"] as const;

const ASSIGN_COVERAGE_KEYS = [
  "shepherd_profile_id",
  "over_shepherd_id",
  "assigned_at",
] as const;

// end_coverage forms attach the shepherd_profile_id alongside the
// assignment id so the action can revalidate the right detail page on
// success. It is intentionally optional and NOT passed to the RPC -- the
// RPC reads the canonical shepherd_profile_id from the assignment row.
const END_COVERAGE_KEYS = [
  "assignment_id",
  "ended_at",
  "shepherd_profile_id",
] as const;

// Phase SC.4 private-note keys. shepherd_profile_id is form-only (for
// revalidation); the RPC keys on care_profile_id and derives the creator from
// the actor. The body travels as base64 ciphertext -- never plaintext.
const UPSERT_PRIVATE_NOTE_KEYS = [
  "care_profile_id",
  "set_body",
  "ciphertext",
  "iv",
  "dek_version",
  "shepherd_profile_id",
] as const;

const UPSERT_PRIVATE_NOTE_ARG_KEYS = [
  "care_profile_id",
  "ciphertext",
  "iv",
  "dek_version",
  "set_body",
] as const;

const ENROLL_PRIVATE_NOTE_KEYS = [
  "dek_version",
  "slots",
  "shepherd_profile_id",
] as const;

function shepherdCarePaths(shepherdProfileId?: string): string[] {
  return [
    "/admin/shepherd-care",
    ...(shepherdProfileId ? [`/admin/shepherd-care/${shepherdProfileId}`] : []),
  ];
}

function overShepherdPaths(overShepherdId?: string): string[] {
  return [
    "/admin/shepherd-care",
    "/admin/shepherd-care/over-shepherds",
    ...(overShepherdId
      ? [`/admin/shepherd-care/over-shepherds/${overShepherdId}`]
      : []),
  ];
}

// Archiving an over-shepherd ends coverage for every leader they covered (#423),
// so each of those leaders' detail pages now shows the wrong coverage. We don't
// know that (unbounded) set of leader ids in the action, and the pages are
// force-dynamic so the server re-renders fresh — but the client Router Cache can
// still serve a stale copy. Invalidate the whole leader-detail route in one call
// so they refresh, mirroring how the assign/end-coverage actions revalidate the
// specific leader they touch. (PR #428 review.)
const LEADER_DETAIL_ROUTE = {
  path: "/admin/shepherd-care/[profileId]",
  type: "page",
} as const;

// ----- Phase 5D.1 — over-shepherd coverage actions ------------------------

// ----- adminCreateOverShepherd --------------------------------------------

const CREATE_OVER_SHEPHERD_SPEC: AdminWriteActionSpec<
  CreateOverShepherdPayload,
  { id: string }
> = {
  name: "admin.over_shepherd.create",
  keys: CREATE_OVER_SHEPHERD_KEYS,
  validate: validateCreateOverShepherdPayload,
  okFields: (value) => ({
    has_email: value.email !== null,
    has_phone: value.phone !== null,
    has_notes: value.notes !== null,
  }),
  rpc: (client, value) =>
    adminRpc(
      client,
      "admin_create_over_shepherd",
      toRpcArgs(value, CREATE_OVER_SHEPHERD_KEYS)
    ),
  revalidate: () => overShepherdPaths(),
  noDataError: "The over-shepherd wasn't saved. Please try again.",
};

export async function adminCreateOverShepherd(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<CreateOverShepherdPayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(CREATE_OVER_SHEPHERD_SPEC, prev, input);
}

// ----- adminUpdateOverShepherd --------------------------------------------

const UPDATE_OVER_SHEPHERD_SPEC: AdminWriteActionSpec<
  UpdateOverShepherdPayload,
  { id: string }
> = {
  name: "admin.over_shepherd.update",
  keys: UPDATE_OVER_SHEPHERD_KEYS,
  validate: validateUpdateOverShepherdPayload,
  fields: (_actor, value) => ({
    target_over_shepherd_id: value.over_shepherd_id,
  }),
  okFields: (value) => ({
    active: value.active,
    has_email: value.email !== null,
    has_phone: value.phone !== null,
    has_notes: value.notes !== null,
  }),
  rpc: (client, value) =>
    adminRpc(
      client,
      "admin_update_over_shepherd",
      toRpcArgs(value, UPDATE_OVER_SHEPHERD_KEYS)
    ),
  revalidate: (value) => [
    ...overShepherdPaths(value.over_shepherd_id),
    ...(value.active === false ? [LEADER_DETAIL_ROUTE] : []),
  ],
  noDataError: "The over-shepherd wasn't updated. Please try again.",
};

export async function adminUpdateOverShepherd(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<UpdateOverShepherdPayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(UPDATE_OVER_SHEPHERD_SPEC, prev, input);
}

// ----- adminSetOverShepherdActive -----------------------------------------
// Focused archive/restore toggle for the list + detail buttons — flips only the
// active flag (the RPC maintains archived_at) without re-sending the record.

const SET_OVER_SHEPHERD_ACTIVE_SPEC: AdminWriteActionSpec<
  SetOverShepherdActivePayload,
  { id: string }
> = {
  name: "admin.over_shepherd.set_active",
  keys: SET_OVER_SHEPHERD_ACTIVE_KEYS,
  validate: validateSetOverShepherdActivePayload,
  fields: (_actor, value) => ({
    target_over_shepherd_id: value.over_shepherd_id,
  }),
  okFields: (value) => ({ active: value.active }),
  rpc: (client, value) =>
    adminRpc(client, "admin_set_over_shepherd_active", {
      p_over_shepherd_id: value.over_shepherd_id,
      p_active: value.active,
    }),
  revalidate: (value) => [
    ...overShepherdPaths(value.over_shepherd_id),
    ...(value.active === false ? [LEADER_DETAIL_ROUTE] : []),
  ],
  noDataError: "The over-shepherd wasn't updated. Please try again.",
};

export async function adminSetOverShepherdActive(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<SetOverShepherdActivePayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(SET_OVER_SHEPHERD_ACTIVE_SPEC, prev, input);
}

// ----- adminAssignShepherdCoverage ----------------------------------------

const ASSIGN_COVERAGE_SPEC: AdminWriteActionSpec<
  AssignShepherdCoveragePayload,
  { id: string }
> = {
  name: "admin.shepherd_coverage.assign",
  keys: ASSIGN_COVERAGE_KEYS,
  validate: validateAssignShepherdCoveragePayload,
  fields: (_actor, value) => ({
    target_shepherd_profile_id: value.shepherd_profile_id,
  }),
  okFields: (value) => ({ over_shepherd_id: value.over_shepherd_id }),
  rpc: (client, value) =>
    adminRpc(client, "admin_assign_shepherd_to_over_shepherd", {
      p_shepherd_profile_id: value.shepherd_profile_id,
      p_over_shepherd_id: value.over_shepherd_id,
      p_assigned_at: value.assigned_at,
    }),
  revalidate: (value) => [
    ...shepherdCarePaths(value.shepherd_profile_id),
    ...overShepherdPaths(value.over_shepherd_id),
  ],
  noDataError: "The coverage assignment wasn't saved. Please try again.",
};

export async function adminAssignShepherdCoverage(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<AssignShepherdCoveragePayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(ASSIGN_COVERAGE_SPEC, prev, input);
}

// ----- adminEndShepherdCoverage -------------------------------------------

const END_COVERAGE_SPEC: AdminWriteActionSpec<
  EndShepherdCoverageAssignmentPayload,
  { id: string }
> = {
  name: "admin.shepherd_coverage.end",
  keys: END_COVERAGE_KEYS,
  validate: validateEndShepherdCoverageAssignmentPayload,
  fields: (_actor, value) => ({ target_assignment_id: value.assignment_id }),
  rpc: (client, value) =>
    adminRpc(client, "admin_end_shepherd_coverage_assignment", {
      p_assignment_id: value.assignment_id,
      p_ended_at: value.ended_at,
    }),
  revalidate: (_value, raw) => {
    const shepherdProfileId =
      typeof raw.shepherd_profile_id === "string"
        ? raw.shepherd_profile_id
        : undefined;
    return [...shepherdCarePaths(shepherdProfileId), ...overShepherdPaths()];
  },
  noDataError: "The coverage assignment wasn't ended. Please try again.",
};

export async function adminEndShepherdCoverage(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<EndShepherdCoverageAssignmentPayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(END_COVERAGE_SPEC, prev, input);
}

// ----- Phase SC.4 — private care note actions -----------------------------

// ----- adminEnrollPrivateNoteKeys -----------------------------------------

const ENROLL_PRIVATE_NOTE_SPEC: AdminWriteActionSpec<
  EnrollPrivateNoteKeysPayload,
  { id: string }
> = {
  name: "admin.shepherd_care.private_note.enroll",
  keys: ENROLL_PRIVATE_NOTE_KEYS,
  validate: validateEnrollPrivateNoteKeysPayload,
  okFields: (value) => ({ slot_count: value.slots.length }),
  rpc: (client, value) =>
    adminRpc(client, "admin_enroll_private_note_keys", {
      p_dek_version: value.dek_version,
      p_slots: value.slots,
    }),
  revalidate: (_value, raw) => revalidateShepherdFromRaw(raw),
  noDataError: "Private notes couldn't be set up. Please try again.",
};

type EnrollPrivateNoteInput = EnrollPrivateNoteKeysPayload & {
  shepherd_profile_id?: string;
};

export async function adminEnrollPrivateNoteKeys(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<EnrollPrivateNoteInput>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(ENROLL_PRIVATE_NOTE_SPEC, prev, input);
}

// ----- adminUpsertShepherdCarePrivateNote ---------------------------------

const UPSERT_PRIVATE_NOTE_SPEC: AdminWriteActionSpec<
  UpsertShepherdCarePrivateNotePayload,
  { id: string }
> = {
  name: "admin.shepherd_care.upsert_private_note",
  keys: UPSERT_PRIVATE_NOTE_KEYS,
  validate: validateUpsertShepherdCarePrivateNotePayload,
  fields: (_actor, value) => ({
    target_care_profile_id: value.care_profile_id,
  }),
  okFields: (value) => ({ body_set: value.set_body }),
  rpc: (client, value) =>
    adminRpc(
      client,
      "admin_upsert_shepherd_care_private_note",
      toRpcArgs(value, UPSERT_PRIVATE_NOTE_ARG_KEYS)
    ),
  revalidate: (_value, raw) => revalidateShepherdFromRaw(raw),
  noDataError: "The private note wasn't saved. Please try again.",
};

type UpsertPrivateNoteInput = UpsertShepherdCarePrivateNotePayload & {
  shepherd_profile_id?: string;
};

export async function adminUpsertShepherdCarePrivateNote(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<UpsertPrivateNoteInput>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(UPSERT_PRIVATE_NOTE_SPEC, prev, input);
}

// ----- Phase SC.4 (#113) — key-slot lifecycle actions ---------------------

// ----- adminAddPrivateNoteKeySlot (second passkey) ------------------------

// The RPC additionally takes the constant p_slot_type (recovery slots are
// rotated, never added), kept literal at the call site.
const ADD_KEY_SLOT_ARG_KEYS = [
  "credential_id",
  "label",
  "prf_salt",
  "hkdf_salt",
  "wrapped_dek",
  "wrap_iv",
] as const;

const ADD_KEY_SLOT_SPEC: AdminWriteActionSpec<
  AddPrivateNoteKeySlotPayload,
  { id: string }
> = {
  name: "admin.shepherd_care.private_note.add_slot",
  keys: [
    "credential_id",
    "label",
    "prf_salt",
    "hkdf_salt",
    "wrapped_dek",
    "wrap_iv",
    "shepherd_profile_id",
  ],
  validate: validateAddPrivateNoteKeySlotPayload,
  okFields: (value) => ({ has_label: value.label !== null }),
  rpc: (client, value) =>
    adminRpc(client, "admin_add_private_note_key_slot", {
      p_slot_type: "passkey",
      ...toRpcArgs(value, ADD_KEY_SLOT_ARG_KEYS),
    }),
  revalidate: (_value, raw) => revalidateShepherdFromRaw(raw),
  noDataError: "The passkey couldn't be added. Please try again.",
};

type AddKeySlotInput = AddPrivateNoteKeySlotPayload & {
  shepherd_profile_id?: string;
};

export async function adminAddPrivateNoteKeySlot(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<AddKeySlotInput>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(ADD_KEY_SLOT_SPEC, prev, input);
}

// ----- adminRotatePrivateNoteRecovery -------------------------------------

const ROTATE_RECOVERY_ARG_KEYS = [
  "hkdf_salt",
  "wrapped_dek",
  "wrap_iv",
  "label",
] as const;

const ROTATE_RECOVERY_SPEC: AdminWriteActionSpec<
  RotatePrivateNoteRecoveryPayload,
  { id: string }
> = {
  name: "admin.shepherd_care.private_note.rotate_recovery",
  keys: ["hkdf_salt", "wrapped_dek", "wrap_iv", "label", "shepherd_profile_id"],
  validate: validateRotatePrivateNoteRecoveryPayload,
  rpc: (client, value) =>
    adminRpc(
      client,
      "admin_rotate_private_note_recovery",
      toRpcArgs(value, ROTATE_RECOVERY_ARG_KEYS)
    ),
  revalidate: (_value, raw) => revalidateShepherdFromRaw(raw),
  noDataError: "The recovery code couldn't be rotated. Please try again.",
};

type RotateRecoveryInput = RotatePrivateNoteRecoveryPayload & {
  shepherd_profile_id?: string;
};

export async function adminRotatePrivateNoteRecovery(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<RotateRecoveryInput>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(ROTATE_RECOVERY_SPEC, prev, input);
}

// ----- adminRemovePrivateNoteKeySlot --------------------------------------

const REMOVE_KEY_SLOT_SPEC: AdminWriteActionSpec<
  RemovePrivateNoteKeySlotPayload,
  { id: string }
> = {
  name: "admin.shepherd_care.private_note.remove_slot",
  keys: ["slot_id", "shepherd_profile_id"],
  validate: validateRemovePrivateNoteKeySlotPayload,
  fields: (_actor, value) => ({ target_slot_id: value.slot_id }),
  rpc: (client, value) =>
    adminRpc(client, "admin_remove_private_note_key_slot", {
      p_slot_id: value.slot_id,
    }),
  revalidate: (_value, raw) => revalidateShepherdFromRaw(raw),
  noDataError: "The unlock method couldn't be removed. Please try again.",
};

type RemoveKeySlotInput = RemovePrivateNoteKeySlotPayload & {
  shepherd_profile_id?: string;
};

export async function adminRemovePrivateNoteKeySlot(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<RemoveKeySlotInput>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(REMOVE_KEY_SLOT_SPEC, prev, input);
}
