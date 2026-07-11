import { describe, expect, it } from "vitest";

import { callPinnedRpc, callUuidRpc } from "@/lib/shared/rpc";
import type { AppSupabaseClient } from "@/lib/supabase/types";

// This function is never executed. The @ts-expect-error directives make
// npm run typecheck prove that the registry rejects name, args, and channel
// drift. If a future refactor weakens the gateway, an unused directive fails
// TypeScript and therefore the gating CI lane.
async function _registryRejectsDrift(client: AppSupabaseClient) {
  void callPinnedRpc(client, "read_frozen_surface_flag", {
    p_key: "leader_surface",
  });
  void callUuidRpc(client, "set_own_full_name", {
    p_full_name: "Avery Leader",
  });

  // @ts-expect-error unregistered or misspelled Postgres function name
  void callPinnedRpc(client, "read_frozen_surface_flags", {
    p_key: "leader_surface",
  });

  void callPinnedRpc(client, "read_frozen_surface_flag", {
    // @ts-expect-error a drifted argument key is rejected
    p_flag_key: "leader_surface",
  });

  // @ts-expect-error the required argument is missing
  void callPinnedRpc(client, "read_frozen_surface_flag", {});

  // @ts-expect-error a no-argument RPC rejects unknown keys
  void callPinnedRpc(client, "admin_read_feature_flags", { p_extra: true });

  // @ts-expect-error read-only RPCs cannot enter the uuid result channel
  void callUuidRpc(client, "admin_read_feature_flags", {});
}

describe("pinned RPC registry typing guard", () => {
  it("is enforced by TypeScript; the runtime assertion is a no-op", () => {
    expect(typeof _registryRejectsDrift).toBe("function");
  });
});
