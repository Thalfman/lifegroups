import { describe, expect, it, vi } from "vitest";

import {
  rpcAdminEnrollPrivateNoteKeys,
  rpcAdminUpsertShepherdCarePrivateNote,
} from "@/lib/admin/rpc";
import type { AppSupabaseClient } from "@/lib/supabase/types";

const UUID = "11111111-1111-1111-1111-111111111111";

function clientReturning(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => result);
  return { client: { rpc } as unknown as AppSupabaseClient, rpc };
}

describe("SC.4 RPC wrappers pin the exact Postgres function name + args", () => {
  it("rpcAdminEnrollPrivateNoteKeys -> admin_enroll_private_note_keys", async () => {
    const { client, rpc } = clientReturning({ data: UUID, error: null });
    const args = {
      p_dek_version: 1,
      p_slots: [{ slot_type: "recovery", hkdf_salt: "AAAA", wrapped_dek: "BBBB", wrap_iv: "CCCC" }],
    };
    await rpcAdminEnrollPrivateNoteKeys(client, args);
    expect(rpc).toHaveBeenCalledWith("admin_enroll_private_note_keys", args);
  });

  it("rpcAdminUpsertShepherdCarePrivateNote -> admin_upsert_shepherd_care_private_note", async () => {
    const { client, rpc } = clientReturning({ data: UUID, error: null });
    const args = {
      p_care_profile_id: UUID,
      p_ciphertext: "AAAA",
      p_iv: "BBBB",
      p_dek_version: 1,
      p_set_body: true,
    };
    await rpcAdminUpsertShepherdCarePrivateNote(client, args);
    expect(rpc).toHaveBeenCalledWith("admin_upsert_shepherd_care_private_note", args);
  });
});
