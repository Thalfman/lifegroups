// Deep module behind the admin write-action surface. Collapses the
// auth -> parse -> validate -> guard -> client -> RPC -> map-error ->
// revalidate -> log skeleton that every `admin_*` server action repeats,
// so an action file declares only what differs (validator, RPC call,
// log fields, revalidate paths) and never re-spells the control flow or
// its five error branches.
//
// On the deliberate choice to own logging here, against the note in
// `lib/observability/instrument.ts` that argues for keeping `ctx.finish`
// calls imperative: that note warns against wrapping *imperative control
// flow with many early exits* in a closure. This runner does the
// opposite -- it owns the control flow and the exits, and the action
// author supplies only pure data (a validator and two field-extractors),
// never a closure that threads mutable logging state. The legibility
// concern the note raises therefore does not apply: there are no early
// exits left in the caller to obscure. See docs/adr/0001-admin-write-action-runner.md.

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import { requireAdminSession } from "@/lib/auth/session";
import type { CurrentSession } from "@/lib/auth/session";
import { startActionLog, type FinishFields } from "@/lib/observability/instrument";
import type { LogOutcome } from "@/lib/observability/logger";
import { type ActionResult, actionFail, actionOk, mapRpcError } from "./action-result";

type AdminActor = CurrentSession["profile"];

// Auth gate seam. Both `requireAdminSession` and `requireSuperAdminSession`
// return this shape, so a super-admin-only action only overrides `auth`
// rather than forking the runner. The leader surface returns a different
// shape and gets its own parallel runner.
export type AuthGate = () => Promise<
  { ok: true; session: CurrentSession } | { ok: false; error: string }
>;

type RpcResult = { data: string | null; error: { message: string } | null };

// Structural mirror of the per-surface ValidationResult shapes. The runner
// only reads `.ok`, `.value`, `.errors`, so it stays decoupled from which
// validation module produced the result.
export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

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
    value: V,
  ) => { error: string; code: string; outcome?: LogOutcome } | null;
  // Structured log fields emitted on every post-validation stage
  // (supabase_not_configured, rpc_error, rpc_no_data, ok). May be async so
  // derived values like a hashed email are computed once. `raw` is the
  // pre-validation record, for fields that live outside the validated
  // payload (e.g. a calendar event's group_id used only to revalidate).
  fields?: (
    actor: AdminActor,
    value: V,
    raw: Record<string, unknown>,
  ) => FinishFields | Promise<FinishFields>;
  // Additional fields merged only into the success log line (e.g. the new
  // row id, or an echoed input that is only interesting on success).
  okFields?: (value: V, id: string, raw: Record<string, unknown>) => FinishFields;
  // Maps the validated payload to the typed RPC wrapper call.
  rpc: (client: AppSupabaseClient, value: V) => Promise<RpcResult>;
  // Paths to revalidate on success. `raw` is available for paths derived
  // from input outside the validated payload; return [] to revalidate
  // nothing.
  revalidate: (value: V, raw: Record<string, unknown>) => string | readonly string[];
  // Builds the success value from the RPC's returned id. Defaults to { id }.
  result?: (id: string) => T;
  // User-facing message when the RPC succeeds at the protocol level but
  // returns no id.
  noDataError: string;
};

function readFromForm(
  input: unknown,
  keys: readonly string[],
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
  _prev: ActionResult<T> | undefined,
  // `unknown`, not `ActionInput<V>`: the runner re-parses input through
  // `read`/`keys` before it ever sees the validated `V`, and typing it as
  // `ActionInput<V>` only fights generic inference at the callsites (a
  // wrapper whose public param is `Record<string, unknown>` or `unknown`
  // would otherwise force V wider than the spec). V flows from the spec.
  input: unknown,
): Promise<ActionResult<T>> {
  const ctx = startActionLog(spec.name);

  const auth = await (spec.auth ?? requireAdminSession)();
  if (!auth.ok) {
    ctx.finish("denied", { error_code: "auth_denied" });
    return actionFail([auth.error]);
  }
  const actor = auth.session.profile;
  const actor_role = actor.role;

  const raw = spec.read
    ? spec.read(input)
    : readFromForm(input, spec.keys ?? []);
  const v = spec.validate(raw);
  if (!v.ok) {
    ctx.finish("fail", {
      error_code: "validation_failed",
      actor_role,
      error_count: v.errors.length,
    });
    return actionFail(v.errors);
  }

  if (spec.guard) {
    const denied = spec.guard(actor, v.value);
    if (denied) {
      ctx.finish(denied.outcome ?? "denied", { error_code: denied.code, actor_role });
      return actionFail([denied.error]);
    }
  }

  // Derived once, after validation, so async values (e.g. hashed email)
  // are computed a single time and threaded into every later log line.
  const fields: FinishFields = spec.fields ? await spec.fields(actor, v.value, raw) : {};

  const client = await createSupabaseServerClient();
  if (!client) {
    ctx.finish("fail", { error_code: "supabase_not_configured", actor_role, ...fields });
    return actionFail(["Database is not configured."]);
  }

  const { data, error } = await spec.rpc(client, v.value);
  if (error) {
    ctx.finish("fail", {
      error_code: "rpc_error",
      rpc_token: error.message,
      actor_role,
      ...fields,
    });
    return actionFail([mapRpcError(error.message)]);
  }
  if (!data) {
    ctx.finish("fail", { error_code: "rpc_no_data", actor_role, ...fields });
    return actionFail([spec.noDataError]);
  }

  const paths = spec.revalidate(v.value, raw);
  for (const path of typeof paths === "string" ? [paths] : paths) {
    revalidatePath(path);
  }

  const okFields = spec.okFields ? spec.okFields(v.value, data, raw) : {};
  ctx.finish("ok", { actor_role, ...fields, ...okFields });

  const value = spec.result ? spec.result(data) : ({ id: data } as T);
  return actionOk(value);
}
