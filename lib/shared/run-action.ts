// The single write-action skeleton shared by the admin and leader surfaces.
// Both previously hand-rolled the same control flow — auth -> read ->
// (raw guard) -> validate -> (guard) -> derive fields -> client -> rpc ->
// map-error -> revalidate -> log — diverging only in a handful of places:
// which actor they authenticate, the base log fields that identify that
// actor, whether there is a pre-validation guard on the raw form, the extra
// fields stamped on a validation failure, and the surface's RPC-error message
// table. Those differences are captured as data in `WriteActionCore` so the
// skeleton and its error branches live in exactly one place.
//
// The per-surface runners (`lib/admin/run-action.ts`, `lib/leader/run-action.ts`)
// stay as thin adapters that build a `WriteActionCore` from their own spec and
// keep their existing public types. As in the original runners, an action
// author supplies only pure data and never threads mutable logging state.
// See docs/adr/0001-admin-write-action-runner.md.

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import {
  startActionLog,
  type FinishFields,
} from "@/lib/observability/instrument";
import { log, type LogOutcome } from "@/lib/observability/logger";
import type { ActionResult } from "@/lib/shared/action-result";
import type { ValidationResult } from "@/lib/shared/validation-primitives";

// The core builds an `ActionResult` directly and reads only `.ok`/`.value`/
// `.errors` off the validator's `ValidationResult`, so both envelopes are the
// shared shapes (`@/lib/shared/action-result`, `@/lib/shared/validation-primitives`)
// rather than re-declared per surface.
export type { ActionResult, ValidationResult };

// The RPC result seam. `D` is the shape the typed RPC wrapper returns on
// success. It defaults to `string` — the common case, a bare uuid from a
// `SECURITY DEFINER` RPC — so the ~30 uuid-returning specs need no annotation.
// JSON- and text-returning RPCs (reset baselines, preflight reports, import
// counts) widen `D` to `unknown` or a parsed shape and thread it through
// `result` (below), so those writes stay behind this one skeleton instead of
// re-rolling the pipeline by hand.
export type RpcResult<D = string> = {
  data: D | null;
  error: { message: string } | null;
};

// A path to revalidate on success. A bare string revalidates that exact path
// (the common case). The object form forwards a `type` to `revalidatePath`, so a
// dynamic route can be invalidated wholesale — e.g.
// `{ path: "/admin/shepherd-care/[profileId]", type: "page" }` revalidates every
// leader-detail page in one call, for a write that affects an unknown set of
// them (an over-shepherd archive ends coverage for all the leaders it covered).
export type RevalidateTarget =
  | string
  | { path: string; type: "page" | "layout" };

// Outcome of the optional pre-RPC `context` step. The ok arm carries the
// minted context value (`C`) plus optional fields merged into every later log
// line; the failure arm bails the pipeline with its own error code (outcome
// defaults to "fail" — context failures are usually environmental, e.g. an
// unresolvable site origin, not authorization denials).
export type ContextOutcome<C> =
  | { ok: true; context: C; fields?: FinishFields }
  | { ok: false; error: string; code: string; outcome?: LogOutcome };

// An RPC error token that means the write's job is already done (a double
// submit, a parallel tab). A match is substring-tested against the RPC error
// message — mirroring the raise-token idiom — and finishes as success:
// revalidate runs, the ok line carries `fields` (e.g. a distinguishing
// error_code), and `result` supplies the success value since the errored RPC
// returned no data.
export type TreatAsOkToken<T> = {
  token: string;
  result: T;
  fields?: FinishFields;
};

// Everything that varies between surfaces, captured as data. `Actor` is the
// authenticated identity the guards and field-builders see; `V` the validated
// payload; `T` the success value; `C` the optional pre-RPC context (stays
// `undefined` when no `context` step is declared).
export type WriteActionCore<Actor, V, T, D = string, C = undefined> = {
  // Stable log/action name, e.g. "admin.people.create_leader".
  name: string;
  // Authenticate the actor and the base log fields that identify it on every
  // line after auth (admin: { actor_role }; leader: { actor_profile_id }).
  // A failure may carry a `code` to keep an action's established denial code
  // (e.g. "no_session"); it defaults to "auth_denied".
  authenticate: () => Promise<
    | { ok: true; actor: Actor; baseFields: FinishFields }
    | { ok: false; error: string; code?: string }
  >;
  // Extract the raw record handed to the raw guard and validator.
  read: (input: unknown) => Record<string, unknown>;
  // Optional pre-validation guard on the raw input (e.g. ownership read off a
  // hidden group_id). On success may return fields threaded into every stage
  // from validation onward; on denial bails `denied` with the error_code.
  guardRaw?: (
    actor: Actor,
    raw: Record<string, unknown>
  ) =>
    | { ok: true; fields?: FinishFields }
    | { ok: false; error: string; code: string };
  // Pure payload validator.
  validate: (raw: Record<string, unknown>) => ValidationResult<V>;
  // Extra fields stamped only on the validation_failed line (admin records
  // error_count; leader records nothing extra).
  validationFailedFields?: (errors: string[]) => FinishFields;
  // Optional post-validation guard on the validated value. On denial bails
  // with the error_code; `outcome` defaults to "denied" but may be "fail" for
  // non-authorization bails (e.g. empty-diff). Optional `fields` are logged.
  guard?: (
    actor: Actor,
    value: V
  ) => {
    error: string;
    code: string;
    outcome?: LogOutcome;
    fields?: FinishFields;
  } | null;
  // Fields derived once after the guards and threaded into every stage from
  // the supabase check onward (and onto `ok`). May be async so a hashed value
  // is computed a single time.
  fields?: (
    actor: Actor,
    value: V,
    raw: Record<string, unknown>
  ) => FinishFields | Promise<FinishFields>;
  // Additional fields merged only into the success line. The second argument
  // is the RPC's returned value (`D`) — a bare uuid for the default `string`
  // case, or the parsed JSON/text shape for a widened `D`.
  okFields?: (value: V, data: D, raw: Record<string, unknown>) => FinishFields;
  // Optional pre-RPC context minting (an invite token + its hash, a resolved
  // site origin). Runs after the Supabase client exists and immediately before
  // `rpc`, so a missing client still bails `supabase_not_configured` first.
  // The minted value reaches `rpc` and `result`; a failure bails with its own
  // error code.
  context?: (
    actor: Actor,
    value: V,
    raw: Record<string, unknown>
  ) => ContextOutcome<C> | Promise<ContextOutcome<C>>;
  // RPC error tokens that mean the write's job is already done; a match
  // finishes as success instead of `rpc_error` (see `TreatAsOkToken`).
  treatAsOk?: readonly TreatAsOkToken<T>[];
  // Maps the validated payload to the typed RPC wrapper call. `context` is the
  // value minted by the optional step above (`undefined` when not declared).
  rpc: (
    client: AppSupabaseClient,
    value: V,
    context: C
  ) => Promise<RpcResult<D>>;
  // Paths to revalidate on success; `raw` is available for paths derived from
  // input outside the validated payload. A target may be a bare path string or
  // a typed `RevalidateTarget` (to invalidate a whole dynamic route).
  revalidate: (
    value: V,
    raw: Record<string, unknown>
  ) => RevalidateTarget | readonly RevalidateTarget[];
  // Builds the success value from the RPC's returned data and the validated
  // payload. Defaults to { id: data } (valid when `D` is the default
  // `string`). A widened `D` (parsed JSON / a text count) maps its shape here;
  // `value` is in scope for success fields that live on the payload rather than
  // the RPC return (e.g. the deleted entity's type alongside its tombstone id);
  // `context` carries the pre-RPC minted value (e.g. the raw invite token that
  // only its hash was written for).
  result?: (data: D, value: V, context: C) => T;
  // User-facing message when the RPC succeeds but returns no id.
  noDataError: string;
  // Surface-specific RPC-error token -> message table.
  mapRpcError: (raw: string) => string;
};

// Generic, detail-free message returned when an unexpected throw escapes a
// pipeline stage. Internal error text never reaches the client.
const UNHANDLED_EXCEPTION_MESSAGE = "Something went wrong. Please try again.";

// Capture an unexpected throw as structured log fields (server-side only — these
// land in the action log, never in the ActionResult returned to the client).
// Before the exception net existed, an uncaught throw propagated to Next.js,
// which logged the stack; now that the net swallows it, we must record the same
// detail here or production write failures become undiagnosable.
function unhandledExceptionFields(error: unknown): FinishFields {
  if (error instanceof Error) {
    return {
      error_name: error.name,
      error_message: error.message,
      error_stack: error.stack,
    };
  }
  return { error_message: String(error) };
}

// Next.js navigation (`redirect()`, `notFound()`) works by throwing an error
// whose `digest` encodes the navigation; Next must receive that throw for the
// navigation to happen. Detect it by digest shape (a local predicate — the
// `next/dist` helpers are private API) so the exception net rethrows instead
// of swallowing the navigation as an `unhandled_exception`. Migrated actions
// deliberately keep `redirect()` in their wrappers, after the runner returns,
// so this branch is defense-in-depth.
function isNextNavigationError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const digest = (error as { digest?: unknown }).digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") ||
      digest === "NEXT_NOT_FOUND" ||
      digest.startsWith("NEXT_HTTP_ERROR_FALLBACK"))
  );
}

export async function runWriteAction<Actor, V, T, D = string, C = undefined>(
  core: WriteActionCore<Actor, V, T, D, C>,
  input: unknown
): Promise<ActionResult<T>> {
  const ctx = startActionLog(core.name);

  // Top-level exception net. Every non-throwing branch below calls
  // `ctx.finish(...)` itself; `finish` is idempotent (first call wins), so the
  // `finally` is a pure safety net: if any stage (validate / guard / fields /
  // RPC / mapRpcError / revalidatePath) throws unexpectedly, the catch returns
  // a generic typed error (no detail leak) and the finally emits the single
  // terminal `unhandled_exception` line that would otherwise be missing — the
  // action log can never be left unfinished.
  let exceptionFields: FinishFields | undefined;
  try {
    return await runWriteActionPipeline(core, input, ctx);
  } catch (error) {
    // Navigation throws must reach Next.js or the redirect never happens.
    // Finish the log first (first call wins, so the finally's
    // `unhandled_exception` stamp becomes a no-op), then rethrow.
    if (isNextNavigationError(error)) {
      ctx.finish("ok", { error_code: "next_navigation" });
      throw error;
    }
    // The catch converts the throw into a generic typed ActionResult (no detail
    // reaches the client); the finally records the terminal log line, stamped
    // with the error's name/message/stack so the swallowed throw stays
    // diagnosable in server logs.
    exceptionFields = unhandledExceptionFields(error);
    return { ok: false, errors: [UNHANDLED_EXCEPTION_MESSAGE] };
  } finally {
    // On the non-throwing paths the pipeline already called `finish`, so this is
    // an idempotent no-op and `exceptionFields` is unused.
    ctx.finish("fail", {
      error_code: "unhandled_exception",
      ...exceptionFields,
    });
  }
}

async function runWriteActionPipeline<Actor, V, T, D, C>(
  core: WriteActionCore<Actor, V, T, D, C>,
  input: unknown,
  ctx: ReturnType<typeof startActionLog>
): Promise<ActionResult<T>> {
  const auth = await core.authenticate();
  if (!auth.ok) {
    ctx.finish("denied", { error_code: auth.code ?? "auth_denied" });
    return { ok: false, errors: [auth.error] };
  }
  const { actor, baseFields } = auth;

  const raw = core.read(input);

  // Pre-validation guard tier. Its fields thread into validation_failed and
  // every later stage; the denial line carries only the base fields.
  let rawFields: FinishFields = {};
  if (core.guardRaw) {
    const g = core.guardRaw(actor, raw);
    if (!g.ok) {
      ctx.finish("denied", { error_code: g.code, ...baseFields });
      return { ok: false, errors: [g.error] };
    }
    rawFields = g.fields ?? {};
  }

  const v = core.validate(raw);
  if (!v.ok) {
    ctx.finish("fail", {
      error_code: "validation_failed",
      ...baseFields,
      ...rawFields,
      ...(core.validationFailedFields
        ? core.validationFailedFields(v.errors)
        : {}),
    });
    return { ok: false, errors: v.errors };
  }

  if (core.guard) {
    const denied = core.guard(actor, v.value);
    if (denied) {
      ctx.finish(denied.outcome ?? "denied", {
        error_code: denied.code,
        ...baseFields,
        ...rawFields,
        ...(denied.fields ?? {}),
      });
      return { ok: false, errors: [denied.error] };
    }
  }

  // Derived once, after the guards, so async values (e.g. a hashed email) are
  // computed a single time and threaded into every later log line.
  let fields: FinishFields = core.fields
    ? await core.fields(actor, v.value, raw)
    : {};

  const client = await createSupabaseServerClient();
  if (!client) {
    ctx.finish("fail", {
      error_code: "supabase_not_configured",
      ...baseFields,
      ...rawFields,
      ...fields,
    });
    return { ok: false, errors: ["Database is not configured."] };
  }

  // Pre-RPC context minting. Deliberately after the client check so a missing
  // client still bails `supabase_not_configured` before a context failure
  // (e.g. `origin_unresolved`). Its fields thread into every later log line.
  let contextValue = undefined as C;
  if (core.context) {
    const minted = await core.context(actor, v.value, raw);
    if (!minted.ok) {
      ctx.finish(minted.outcome ?? "fail", {
        error_code: minted.code,
        ...baseFields,
        ...rawFields,
        ...fields,
      });
      return { ok: false, errors: [minted.error] };
    }
    contextValue = minted.context;
    fields = { ...fields, ...(minted.fields ?? {}) };
  }

  // Cache invalidation is post-commit work. Once the RPC has committed, an
  // ordinary cache failure must never tell the caller the mutation failed (and
  // invite a duplicate retry). Emit a separate, sanitized diagnostic instead;
  // Next navigation/control-flow throws still propagate to the framework.
  const runPostCommitRevalidate = () => {
    const logFailure = (error: unknown) => {
      log.warn({
        event: "action_revalidation_failed",
        route_or_action: core.name,
        outcome: "fail",
        request_id: ctx.requestId,
        error_code: "revalidation_failed",
        error_name: error instanceof Error ? error.name : "UnknownError",
      });
    };

    let targets: RevalidateTarget | readonly RevalidateTarget[];
    try {
      targets = core.revalidate(v.value, raw);
    } catch (error) {
      if (isNextNavigationError(error)) throw error;
      logFailure(error);
      return;
    }

    for (const target of Array.isArray(targets) ? targets : [targets]) {
      try {
        if (typeof target === "string") revalidatePath(target);
        else revalidatePath(target.path, target.type);
      } catch (error) {
        if (isNextNavigationError(error)) throw error;
        logFailure(error);
      }
    }
  };

  const { data, error } = await core.rpc(client, v.value, contextValue);
  if (error) {
    // An idempotent-success token: the write's job is already done (a double
    // submit, a parallel tab) — finish exactly like success.
    const alreadyDone = core.treatAsOk?.find((t) =>
      error.message.includes(t.token)
    );
    if (alreadyDone) {
      ctx.finish("ok", {
        ...baseFields,
        ...rawFields,
        ...fields,
        ...(alreadyDone.fields ?? {}),
      });
      runPostCommitRevalidate();
      return { ok: true, value: alreadyDone.result };
    }
    ctx.finish("fail", {
      error_code: "rpc_error",
      rpc_token: error.message,
      ...baseFields,
      ...rawFields,
      ...fields,
    });
    return { ok: false, errors: [core.mapRpcError(error.message)] };
  }
  // No-data gate. `data == null` (not `!data`) so a widened `D` can carry a
  // legitimately falsy success value — a `false` flag, a `0` count, an empty
  // object. The one falsy value that is still a failure is the empty string:
  // the default `D = string` path is a bare uuid (and the text channel a count),
  // and neither is ever `""` on success, so `!data`'s historical rejection of
  // `""` is preserved here rather than silently committing `{ id: "" }`.
  if (data == null || (data as unknown) === "") {
    ctx.finish("fail", {
      error_code: "rpc_no_data",
      ...baseFields,
      ...rawFields,
      ...fields,
    });
    return { ok: false, errors: [core.noDataError] };
  }

  const okFields = core.okFields ? core.okFields(v.value, data, raw) : {};
  ctx.finish("ok", { ...baseFields, ...rawFields, ...fields, ...okFields });

  // Default `{ id: data }` is only sound for the `string` case; a widened `D`
  // must supply `result`. The cast preserves the prior default behavior.
  const value = core.result
    ? core.result(data, v.value, contextValue)
    : ({ id: data } as T);
  runPostCommitRevalidate();
  return { ok: true, value };
}
