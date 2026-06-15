import { describe, expect, it } from "vitest";

import { adminRpc, type AdminUuidRpcArgs } from "@/lib/admin/rpc";
import type { AppSupabaseClient } from "@/lib/supabase/types";

// Write-path arg typing guard (issue #636, slice 3). Every Server Action maps its
// validator's output to the `p_*` args of a SECURITY DEFINER RPC by hand — the
// write-side analog of the named-column read allowlists, kept explicit so the
// trust boundary stays eyeball-able. This file LOCKS the compile-time bridge: the
// typed `adminRpc<K>` wrapper pins the args object to `AdminUuidRpcArgs[K]`, and
// the mapping reads off the validator's output type, so a validator field rename
// (or a dropped / extra / wrong-typed arg) that desyncs the two is a type error.
//
// The `_desyncIsACompileError` function below NEVER runs. It exists so `npm run
// typecheck` (which CI gates on) proves each desync case is a compile error: the
// `@ts-expect-error` directives fail the build if any case ever STOPS erroring,
// catching a future weakening of the wrapper's typing. No runtime assertion can
// observe this — the guard is purely at the type level.

// A stand-in for a validator's output type (the shape `validate` returns).
type CreateLeaderPayload = { full_name: string; email: string; phone?: string };

async function _desyncIsACompileError(client: AppSupabaseClient) {
  const value = {} as CreateLeaderPayload;

  // Baseline: a faithful mapping from the validator output to the declared
  // p_* args compiles cleanly.
  void adminRpc(client, "admin_create_leader_profile", {
    p_full_name: value.full_name,
    p_email: value.email,
    p_phone: value.phone ?? null,
  });

  void adminRpc(client, "admin_create_leader_profile", {
    p_full_name: value.full_name,
    // @ts-expect-error a renamed/removed validator field no longer exists on the output type
    p_email: value.email_address,
    p_phone: value.phone ?? null,
  });

  // @ts-expect-error dropping a required p_* arg desyncs from the RPC's declared shape
  void adminRpc(client, "admin_create_leader_profile", {
    p_full_name: value.full_name,
    p_phone: value.phone ?? null,
  });

  void adminRpc(client, "admin_create_leader_profile", {
    p_full_name: value.full_name,
    p_email: value.email,
    p_phone: value.phone ?? null,
    // @ts-expect-error an extra p_* arg the RPC does not declare is rejected
    p_unknown: 1,
  });

  void adminRpc(client, "admin_create_leader_profile", {
    p_full_name: value.full_name,
    // @ts-expect-error a wrong-typed arg (number where the RPC wants string) is rejected
    p_email: 123,
    p_phone: value.phone ?? null,
  });

  // The declared args type is the single source of truth a mapper is pinned to.
  const _args: AdminUuidRpcArgs["admin_create_leader_profile"] = {
    p_full_name: value.full_name,
    p_email: value.email,
    p_phone: value.phone ?? null,
  };
  void _args;
}

describe("write-path RPC arg typing guard", () => {
  it("is enforced by tsc — see _desyncIsACompileError (runtime no-op)", () => {
    // The real assertion is the `@ts-expect-error` directives above, checked by
    // `npm run typecheck`. This keeps the file a valid vitest suite.
    expect(typeof _desyncIsACompileError).toBe("function");
  });
});
