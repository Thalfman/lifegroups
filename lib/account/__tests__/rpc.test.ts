import { describe, expect, it, vi } from "vitest";

import {
  rpcMarkFirstRunOrientationSeen,
  rpcRequestOwnAccountDeletion,
  rpcSetOwnFullName,
} from "@/lib/account/rpc";
import type { AppSupabaseClient } from "@/lib/supabase/types";

const UUID = "11111111-1111-1111-1111-111111111111";

function clientReturning(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => result);
  return { client: { rpc } as unknown as AppSupabaseClient, rpc };
}

describe("account RPC wrappers pin the exact Postgres function name + args", () => {
  it("set_own_full_name passes through verbatim", async () => {
    const { client, rpc } = clientReturning({ data: UUID, error: null });
    await rpcSetOwnFullName(client, { p_full_name: "Jordan Rivers" });
    expect(rpc).toHaveBeenCalledWith("set_own_full_name", {
      p_full_name: "Jordan Rivers",
    });
  });

  it("request_own_account_deletion passes through verbatim", async () => {
    const { client, rpc } = clientReturning({ data: UUID, error: null });
    await rpcRequestOwnAccountDeletion(client, { p_reason: "Moving away" });
    expect(rpc).toHaveBeenCalledWith("request_own_account_deletion", {
      p_reason: "Moving away",
    });
  });

  it("mark_first_run_orientation_seen forwards empty args", async () => {
    const { client, rpc } = clientReturning({ data: UUID, error: null });
    await rpcMarkFirstRunOrientationSeen(client);
    expect(rpc).toHaveBeenCalledWith("mark_first_run_orientation_seen", {});
  });

  it("surfaces the RPC error message to the caller", async () => {
    const { client } = clientReturning({
      data: null,
      error: { message: "name_not_pending" },
    });
    const r = await rpcSetOwnFullName(client, { p_full_name: "x" });
    expect(r.error?.message).toBe("name_not_pending");
    expect(r.data).toBeNull();
  });
});
