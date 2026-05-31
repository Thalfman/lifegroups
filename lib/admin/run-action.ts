// Admin write-action runner. A thin adapter over the shared write-action core
// (`lib/shared/run-action.ts`): it declares the admin surface's variation
// points — the admin/super-admin auth gate, the `actor_role` base log field,
// the `error_count` stamped on a validation failure, and the admin RPC-error
// table — and hands them to `runWriteAction`, which owns the auth -> parse ->
// validate -> guard -> client -> RPC -> map-error -> revalidate -> log
// skeleton and its five error branches. An action file declares only what
// differs (validator, RPC call, log fields, revalidate paths) and never
// re-spells the control flow.
//
// On the deliberate choice to own logging in the core, against the note in
// `lib/observability/instrument.ts` that argues for keeping `ctx.finish` calls
// imperative: that note warns against wrapping *imperative control flow with
// many early exits* in a closure. The core does the opposite — it owns the
// control flow and the exits, and the action author supplies only pure data,
// never a closure that threads mutable logging state. The legibility concern
// the note raises therefore does not apply. See
// docs/adr/0001-admin-write-action-runner.md.

import { requireAdminSession } from "@/lib/auth/session";
import type { CurrentSession } from "@/lib/auth/session";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { FinishFields } from "@/lib/observability/instrument";
import type { LogOutcome } from "@/lib/observability/logger";
import { type ActionResult, mapRpcError } from "./action-result";
import {
  runWriteAction,
  type RpcResult,
  type ValidationResult as CoreValidationResult,
} from "@/lib/shared/run-action";

type AdminActor = CurrentSession["profile"];

// Auth gate seam. Both `requireAdminSession` and `requireSuperAdminSession`
// return this shape, so a super-admin-only action only overrides `auth`
// rather than forking the runner. The leader surface returns a different
// shape and gets its own adapter over the same core.
export type AuthGate = () => Promise<
  { ok: true; session: CurrentSession } | { ok: false; error: string }
>;

export type ValidationResult<T> = CoreValidationResult<T>;

// useActionState callback signature accepts a plain object (tests, future
// API callers) or FormData (form submission). Mirrors the per-file alias
// the action files previously each declared.
export type ActionInput<T> = T | FormData;

export type AdminWriteActionSpec<V, T> = {
  // Stable log/action name, e.g. "admin.people.create_leader".
  name: string;
  // Form field names lifted from FormData when input is a form submission.
  // Ignored when `read` is supplied. Defaults to none.
  keys?: readonly string[];
  // Custom raw extractor for actions whose FormData mapping is not a flat
  // key lift (checkbox presence, empty-string-to-null, all-entries). When
  // omitted, the default lifts `keys` from FormData. Receives the action's
  // raw `input` and returns the record handed to `validate`.
  read?: (input: unknown) => Record<string, unknown>;
  // Pure payload validator.
  validate: (raw: Record<string, unknown>) => ValidationResult<V>;
  // Auth gate. Defaults to `requireAdminSession`; super-admin actions pass
  // `requireSuperAdminSession`.
  auth?: AuthGate;
  // Optional post-validation guard (e.g. self-target, empty-diff). Return a
  // denial to bail with the given error_code; `outcome` defaults to
  // "denied" but may be "fail" for non-authorization bails like empty-diff.
  // Chain several distinct checks by returning the first one that denies.
  guard?: (
    actor: AdminActor,
    value: V
  ) => { error: string; code: string; outcome?: LogOutcome } | null;
  // Structured log fields emitted on every post-validation stage
  // (supabase_not_configured, rpc_error, rpc_no_data, ok). May be async so
  // derived values like a hashed email are computed once. `raw` is the
  // pre-validation record, for fields that live outside the validated
  // payload (e.g. a calendar event's group_id used only to revalidate).
  fields?: (
    actor: AdminActor,
    value: V,
    raw: Record<string, unknown>
  ) => FinishFields | Promise<FinishFields>;
  // Additional fields merged only into the success log line (e.g. the new
  // row id, or an echoed input that is only interesting on success).
  okFields?: (
    value: V,
    id: string,
    raw: Record<string, unknown>
  ) => FinishFields;
  // Maps the validated payload to the typed RPC wrapper call.
  rpc: (client: AppSupabaseClient, value: V) => Promise<RpcResult>;
  // Paths to revalidate on success. `raw` is available for paths derived
  // from input outside the validated payload; return [] to revalidate
  // nothing.
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

function readFromForm(
  input: unknown,
  keys: readonly string[]
): Record<string, unknown> {
  if (input instanceof FormData) {
    const out: Record<string, unknown> = {};
    for (const key of keys) {
      const value = input.get(key);
      out[key] = value === null ? undefined : String(value);
    }
    return out;
  }
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return {};
}

export async function runAdminWriteAction<V, T>(
  spec: AdminWriteActionSpec<V, T>,
  // `_prev` is the previous useActionState value, ignored by the runner.
  _prev: ActionResult<T> | undefined,
  // `unknown`, not `ActionInput<V>`: the core re-parses input through
  // `read`/`keys` before it ever sees the validated `V`, and typing it as
  // `ActionInput<V>` only fights generic inference at the callsites. V flows
  // from the spec.
  input: unknown
): Promise<ActionResult<T>> {
  return runWriteAction<AdminActor, V, T>(
    {
      name: spec.name,
      authenticate: async () => {
        const auth = await (spec.auth ?? requireAdminSession)();
        if (!auth.ok) return { ok: false, error: auth.error };
        const actor = auth.session.profile;
        return { ok: true, actor, baseFields: { actor_role: actor.role } };
      },
      read: spec.read ?? ((input) => readFromForm(input, spec.keys ?? [])),
      validate: spec.validate,
      validationFailedFields: (errors) => ({ error_count: errors.length }),
      guard: spec.guard,
      fields: spec.fields,
      okFields: spec.okFields,
      rpc: spec.rpc,
      revalidate: spec.revalidate,
      result: spec.result,
      noDataError: spec.noDataError,
      mapRpcError,
    },
    input
  );
}
