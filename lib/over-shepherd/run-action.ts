// Deep module behind the Over-Shepherd write-action surface — the sibling of
// lib/leader/run-action.ts and lib/admin/run-action.ts. Same skeleton (auth ->
// read -> validate -> guard -> client -> rpc -> map-error -> revalidate ->
// log), with one surface-specific tier: a coverage guard. Before the RPC, the
// runner resolves the caller's active coverage (OS.2 bridge) and refuses to
// log against a Shepherd outside it. This is defense-in-depth — the narrow
// SECURITY DEFINER RPC re-checks coverage and is the real enforcement point.
//
// As in the sibling runners, the action author supplies only pure data and
// never threads mutable logging state. See docs/adr/0001-admin-write-action-runner.md.

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import { requireOverShepherdActor } from "@/lib/auth/session";
import { type FinishFields, startActionLog } from "@/lib/observability/instrument";
import {
  fetchOverShepherdCoverageForCaller,
  isCoveredShepherd,
} from "./coverage";
import { type ActionResult, actionFail, actionOk, mapRpcError } from "./action-result";

export type OverShepherdActor = { profileId: string };

type RpcResult = { data: string | null; error: { message: string } | null };

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

export type ActionInput<T> = T | FormData;

export type OverShepherdWriteActionSpec<V, T> = {
  // Stable log/action name, e.g. "over_shepherd.care.log_interaction".
  name: string;
  // Form field names lifted from FormData when input is a form submission.
  keys?: readonly string[];
  // Custom raw extractor when the FormData mapping isn't a flat key lift.
  read?: (input: unknown) => Record<string, unknown>;
  // Pure payload validator.
  validate: (raw: Record<string, unknown>) => ValidationResult<V>;
  // The covered-Shepherd id this write targets, for the coverage guard.
  targetShepherdId: (value: V) => string;
  // Structured log fields emitted from the supabase stage onward (and on ok).
  fields?: (actor: OverShepherdActor, value: V) => FinishFields;
  // Fields merged only into the success line.
  okFields?: (value: V, id: string) => FinishFields;
  // Maps the validated payload to the typed RPC wrapper call.
  rpc: (client: AppSupabaseClient, value: V) => Promise<RpcResult>;
  // Paths to revalidate on success.
  revalidate: (value: V) => string | readonly string[];
  // Builds the success value from the RPC's returned id. Defaults to { id }.
  result?: (id: string) => T;
  // User-facing message when the RPC succeeds but returns no id.
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

export async function runOverShepherdWriteAction<V, T>(
  spec: OverShepherdWriteActionSpec<V, T>,
  _prev: ActionResult<T> | undefined,
  input: unknown,
): Promise<ActionResult<T>> {
  const ctx = startActionLog(spec.name);

  const auth = await requireOverShepherdActor();
  if (!auth.ok) {
    ctx.finish("denied", { error_code: "auth_denied" });
    return actionFail([auth.error]);
  }
  const actor: OverShepherdActor = { profileId: auth.profileId };
  const base: FinishFields = { actor_profile_id: actor.profileId };

  const raw = spec.read ? spec.read(input) : readFromForm(input, spec.keys ?? []);
  const v = spec.validate(raw);
  if (!v.ok) {
    ctx.finish("fail", { error_code: "validation_failed", ...base });
    return actionFail(v.errors);
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    ctx.finish("fail", { error_code: "supabase_not_configured", ...base });
    return actionFail(["Database is not configured."]);
  }

  // Coverage guard (defense-in-depth; the RPC re-checks). A backend failure
  // resolving coverage surfaces as a transient fail, not a denial.
  const coverage = await fetchOverShepherdCoverageForCaller(client);
  if (coverage.error) {
    ctx.finish("fail", { error_code: "coverage_lookup_failed", ...base });
    return actionFail(["Service is temporarily unavailable. Please try again."]);
  }
  if (!isCoveredShepherd(coverage.data, spec.targetShepherdId(v.value))) {
    ctx.finish("denied", { error_code: "not_covered", ...base });
    return actionFail([
      "That Shepherd isn't in your care. You can only log interactions for the Shepherds you cover.",
    ]);
  }

  const fields: FinishFields = spec.fields ? spec.fields(actor, v.value) : {};

  const { data, error } = await spec.rpc(client, v.value);
  if (error) {
    ctx.finish("fail", {
      error_code: "rpc_error",
      rpc_token: error.message,
      ...base,
      ...fields,
    });
    return actionFail([mapRpcError(error.message)]);
  }
  if (!data) {
    ctx.finish("fail", { error_code: "rpc_no_data", ...base, ...fields });
    return actionFail([spec.noDataError]);
  }

  const paths = spec.revalidate(v.value);
  for (const path of typeof paths === "string" ? [paths] : paths) {
    revalidatePath(path);
  }

  const okFields = spec.okFields ? spec.okFields(v.value, data) : {};
  ctx.finish("ok", { ...base, ...fields, ...okFields });

  const value = spec.result ? spec.result(data) : ({ id: data } as T);
  return actionOk(value);
}
