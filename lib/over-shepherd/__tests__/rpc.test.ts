import { describe, expect, it, vi } from "vitest";

import { overShepherdRpc } from "@/lib/over-shepherd/rpc";
import type { AppSupabaseClient } from "@/lib/supabase/types";

const UUID = "11111111-1111-1111-1111-111111111111";

function clientReturning(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => result);
  return { client: { rpc } as unknown as AppSupabaseClient, rpc };
}

describe("over-shepherd RPC table pins the exact Postgres function name + args", () => {
  it("over_shepherd_log_broad_note passes through verbatim", async () => {
    const { client, rpc } = clientReturning({ data: UUID, error: null });
    const args = {
      p_shepherd_profile_id: UUID,
      p_note: "Checked in, doing well.",
    };
    await overShepherdRpc(client, "over_shepherd_log_broad_note", args);
    expect(rpc).toHaveBeenCalledWith("over_shepherd_log_broad_note", args);
  });

  it("surfaces the RPC error message to the caller", async () => {
    const { client } = clientReturning({
      data: null,
      error: { message: "not_covered" },
    });
    const r = await overShepherdRpc(client, "over_shepherd_log_broad_note", {
      p_shepherd_profile_id: UUID,
      p_note: "x",
    });
    expect(r.error?.message).toBe("not_covered");
    expect(r.data).toBeNull();
  });
});
