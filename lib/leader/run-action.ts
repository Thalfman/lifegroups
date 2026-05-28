// Deep module behind the leader write-action surface. The parallel of
// `lib/admin/run-action.ts`: same auth -> read -> guard -> validate ->
// client -> rpc -> map-error -> revalidate -> log skeleton, but for the
// pastoral leader surface it differs in three ways that make it a sibling
// runner rather than a shared one:
//
//   1. Auth is `requireLeaderActor`, which returns { profileId,
//      assignedGroupIds } (no session/profile). Every log line carries
//      `actor_profile_id`, never `actor_role`.
//   2. Two guard tiers. Leader writes guard group ownership either before
//      validation (calendar update/archive/restore read a hidden group_id
//      off the raw form, `guardRaw`) or after validation (check-in and
//      calendar create trust the validated `group_id`, `guard`). The
//      timing changes which fields appear on the validation_failed line,
//      so the two tiers are distinct hooks.
//   3. The error-message table is the pastoral leader one.
//
// As in the admin runner, the action author supplies only pure data and
// never threads mutable logging state. See docs/adr/0001-admin-write-action-runner.md.

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import { requireLeaderActor } from "@/lib/auth/session";
import { type FinishFields, startActionLog } from "@/lib/observability/instrument";
import { type ActionResult, actionFail, actionOk, mapRpcError } from "./action-result";

// Narrow actor the guards see: the profile id plus the groups this leader
// is assigned to, for the defense-in-depth membership checks.
export type LeaderActor = { profileId: string; assignedGroupIds: string[] };

type RpcResult = { data: string | null; error: { message: string } | null };

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

export type LeaderWriteActionSpec<V, T> = {
  // Stable log/action name, e.g. "leader.checkin.submit".
  name: string;
  // Raw extractor. Leader forms each have a bespoke mapping (JSON-encoded
  // attendance, a server-computed meeting week, lifting all entries), so
  // unlike the admin runner there is no flat-keys default.
  read: (input: unknown) => Record<string, unknown>;
  // Pre-validation guard on the raw input (e.g. ownership from a hidden
  // group_id). On success may return fields threaded into every stage from
  // validation onward; on denial bails with `denied` + the error_code.
  guardRaw?: (
    actor: LeaderActor,
    raw: Record<string, unknown>,
  ) =>
    | { ok: true; fields?: FinishFields }
    | { ok: false; error: string; code: string };
  // Pure payload validator.
  validate: (raw: Record<string, unknown>) => ValidationResult<V>;
  // Post-validation guard on the validated value (e.g. group membership).
  // On denial bails with `denied` + the error_code and optional log fields.
  guard?: (
    actor: LeaderActor,
    value: V,
  ) => { error: string; code: string; fields?: FinishFields } | null;
  // Fields emitted from the supabase stage onward (and on `ok`).
  fields?: (actor: LeaderActor, value: V) => FinishFields;
  // Additional fields merged only into the success line.
  okFields?: (value: V, id: string) => FinishFields;
  // Maps the validated payload to the typed RPC wrapper call.
  rpc: (client: AppSupabaseClient, value: V) => Promise<RpcResult>;
  // Paths to revalidate on success; `raw` is available for paths derived
  // from a hidden form field outside the validated payload.
  revalidate: (value: V, raw: Record<string, unknown>) => string | readonly string[];
  // Builds the success value from the RPC's returned id. Defaults to { id }.
  result?: (id: string) => T;
  // User-facing message when the RPC succeeds at the protocol level but
  // returns no id.
  noDataError: string;
};

export async function runLeaderWriteAction<V, T>(
  spec: LeaderWriteActionSpec<V, T>,
  _prev: ActionResult<T> | undefined,
  input: unknown,
): Promise<ActionResult<T>> {
  const ctx = startActionLog(spec.name);

  const auth = await requireLeaderActor();
  if (!auth.ok) {
    ctx.finish("denied", { error_code: "auth_denied" });
    return actionFail([auth.error]);
  }
  const actor: LeaderActor = {
    profileId: auth.profileId,
    assignedGroupIds: auth.assignedGroupIds,
  };
  const base: FinishFields = { actor_profile_id: actor.profileId };

  const raw = spec.read(input);

  // Pre-validation ownership tier. Its fields thread into validation_failed
  // and every later stage; the denial line carries only `base`.
  let rawFields: FinishFields = {};
  if (spec.guardRaw) {
    const g = spec.guardRaw(actor, raw);
    if (!g.ok) {
      ctx.finish("denied", { error_code: g.code, ...base });
      return actionFail([g.error]);
    }
    rawFields = g.fields ?? {};
  }

  const v = spec.validate(raw);
  if (!v.ok) {
    ctx.finish("fail", { error_code: "validation_failed", ...base, ...rawFields });
    return actionFail(v.errors);
  }

  if (spec.guard) {
    const denied = spec.guard(actor, v.value);
    if (denied) {
      ctx.finish("denied", {
        error_code: denied.code,
        ...base,
        ...rawFields,
        ...(denied.fields ?? {}),
      });
      return actionFail([denied.error]);
    }
  }

  const fields: FinishFields = spec.fields ? spec.fields(actor, v.value) : {};

  const client = await createSupabaseServerClient();
  if (!client) {
    ctx.finish("fail", {
      error_code: "supabase_not_configured",
      ...base,
      ...rawFields,
      ...fields,
    });
    return actionFail(["Database is not configured."]);
  }

  const { data, error } = await spec.rpc(client, v.value);
  if (error) {
    ctx.finish("fail", {
      error_code: "rpc_error",
      rpc_token: error.message,
      ...base,
      ...rawFields,
      ...fields,
    });
    return actionFail([mapRpcError(error.message)]);
  }
  if (!data) {
    ctx.finish("fail", { error_code: "rpc_no_data", ...base, ...rawFields, ...fields });
    return actionFail([spec.noDataError]);
  }

  const paths = spec.revalidate(v.value, raw);
  for (const path of typeof paths === "string" ? [paths] : paths) {
    revalidatePath(path);
  }

  const okFields = spec.okFields ? spec.okFields(v.value, data) : {};
  ctx.finish("ok", { ...base, ...rawFields, ...fields, ...okFields });

  const value = spec.result ? spec.result(data) : ({ id: data } as T);
  return actionOk(value);
}
