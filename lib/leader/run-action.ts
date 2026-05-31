// Leader write-action runner. A thin adapter over the shared write-action core
// (`lib/shared/run-action.ts`), declaring the pastoral leader surface's
// variation points and handing them to `runWriteAction`. It differs from the
// admin adapter in three ways:
//
//   1. Auth is `requireLeaderActor`, which returns { profileId,
//      assignedGroupIds } (no session/profile). Every log line carries
//      `actor_profile_id`, never `actor_role`.
//   2. Two guard tiers. Leader writes guard group ownership either before
//      validation (calendar update/archive/restore read a hidden group_id
//      off the raw form, `guardRaw`) or after validation (check-in and
//      calendar create trust the validated `group_id`, `guard`).
//   3. The error-message table is the pastoral leader one.
//
// As in the admin adapter, the action author supplies only pure data and
// never threads mutable logging state. See
// docs/adr/0001-admin-write-action-runner.md.

import { requireLeaderActor } from "@/lib/auth/session";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { FinishFields } from "@/lib/observability/instrument";
import { type ActionResult, mapRpcError } from "./action-result";
import {
  runWriteAction,
  type RpcResult,
  type ValidationResult as CoreValidationResult,
} from "@/lib/shared/run-action";

// Narrow actor the guards see: the profile id plus the groups this leader
// is assigned to, for the defense-in-depth membership checks.
export type LeaderActor = { profileId: string; assignedGroupIds: string[] };

export type ValidationResult<T> = CoreValidationResult<T>;

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
    raw: Record<string, unknown>
  ) =>
    | { ok: true; fields?: FinishFields }
    | { ok: false; error: string; code: string };
  // Pure payload validator.
  validate: (raw: Record<string, unknown>) => ValidationResult<V>;
  // Post-validation guard on the validated value (e.g. group membership).
  // On denial bails with `denied` + the error_code and optional log fields.
  guard?: (
    actor: LeaderActor,
    value: V
  ) => { error: string; code: string; fields?: FinishFields } | null;
  // Fields emitted from the supabase stage onward (and on `ok`).
  fields?: (actor: LeaderActor, value: V) => FinishFields;
  // Additional fields merged only into the success line.
  okFields?: (value: V, id: string) => FinishFields;
  // Maps the validated payload to the typed RPC wrapper call.
  rpc: (client: AppSupabaseClient, value: V) => Promise<RpcResult>;
  // Paths to revalidate on success; `raw` is available for paths derived
  // from a hidden form field outside the validated payload.
  revalidate: (
    value: V,
    raw: Record<string, unknown>
  ) => string | readonly string[];
  // Builds the success value from the RPC's returned id. Defaults to { id }.
  result?: (id: string) => T;
  // User-facing message when the RPC succeeds at the protocol level but
  // returns no id.
  noDataError: string;
};

export async function runLeaderWriteAction<V, T>(
  spec: LeaderWriteActionSpec<V, T>,
  _prev: ActionResult<T> | undefined,
  input: unknown
): Promise<ActionResult<T>> {
  return runWriteAction<LeaderActor, V, T>(
    {
      name: spec.name,
      authenticate: async () => {
        const auth = await requireLeaderActor();
        if (!auth.ok) return { ok: false, error: auth.error };
        const actor: LeaderActor = {
          profileId: auth.profileId,
          assignedGroupIds: auth.assignedGroupIds,
        };
        return {
          ok: true,
          actor,
          baseFields: { actor_profile_id: actor.profileId },
        };
      },
      read: spec.read,
      guardRaw: spec.guardRaw,
      validate: spec.validate,
      guard: spec.guard,
      // The leader spec's fields/okFields don't take `raw`; adapt the wider
      // core hooks down to the narrower leader signatures.
      fields: spec.fields
        ? (actor, value) => spec.fields!(actor, value)
        : undefined,
      okFields: spec.okFields
        ? (value, id) => spec.okFields!(value, id)
        : undefined,
      rpc: spec.rpc,
      revalidate: spec.revalidate,
      result: spec.result,
      noDataError: spec.noDataError,
      mapRpcError,
    },
    input
  );
}
