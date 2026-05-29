import { describe, expect, it, vi } from "vitest";
import { callUuidRpc } from "@/lib/shared/rpc";
import type { AppSupabaseClient } from "@/lib/supabase/types";

const UUID = "11111111-1111-1111-1111-111111111111";

function clientReturning(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => result);
  return { client: { rpc } as unknown as AppSupabaseClient, rpc };
}

describe("callUuidRpc", () => {
  it("forwards the function name and args to the supabase client", async () => {
    const { client, rpc } = clientReturning({ data: UUID, error: null });

    await callUuidRpc(client, "admin_create_group", { p_name: "Alpha" });

    expect(rpc).toHaveBeenCalledWith("admin_create_group", { p_name: "Alpha" });
  });

  it("defaults args to an empty object for no-argument RPCs", async () => {
    const { client, rpc } = clientReturning({ data: UUID, error: null });

    await callUuidRpc(client, "admin_reset_metric_defaults");

    expect(rpc).toHaveBeenCalledWith("admin_reset_metric_defaults", {});
  });

  it("uuid-validates the returned data and lowercases it", async () => {
    const upper = "ABCDEF12-3456-7890-ABCD-EF1234567890";
    const { client } = clientReturning({ data: upper, error: null });

    const result = await callUuidRpc(client, "admin_create_group", {});

    expect(result).toEqual({ data: upper.toLowerCase(), error: null });
  });

  it("returns null data when the RPC yields a non-uuid value", async () => {
    const { client } = clientReturning({ data: "rejected", error: null });

    const result = await callUuidRpc(client, "admin_create_group", {});

    expect(result.data).toBeNull();
  });

  it("surfaces the PostgrestError untouched", async () => {
    const error = { message: "insufficient_privilege" };
    const { client } = clientReturning({ data: null, error });

    const result = await callUuidRpc(client, "admin_create_group", {});

    expect(result).toEqual({ data: null, error });
  });
});
