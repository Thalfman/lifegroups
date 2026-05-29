import { describe, expect, it, vi } from "vitest";

import {
  rpcAdminAddPrivateNoteKeySlot,
  rpcAdminEnrollPrivateNoteKeys,
  rpcAdminRemovePrivateNoteKeySlot,
  rpcAdminRotatePrivateNoteRecovery,
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

  it("rpcAdminAddPrivateNoteKeySlot -> admin_add_private_note_key_slot", async () => {
    const { client, rpc } = clientReturning({ data: UUID, error: null });
    const args = {
      p_slot_type: "passkey",
      p_credential_id: "AAAA",
      p_label: "Phone",
      p_prf_salt: "BBBB",
      p_hkdf_salt: "CCCC",
      p_wrapped_dek: "DDDD",
      p_wrap_iv: "EEEE",
    };
    await rpcAdminAddPrivateNoteKeySlot(client, args);
    expect(rpc).toHaveBeenCalledWith("admin_add_private_note_key_slot", args);
  });

  it("rpcAdminRotatePrivateNoteRecovery -> admin_rotate_private_note_recovery", async () => {
    const { client, rpc } = clientReturning({ data: UUID, error: null });
    const args = { p_hkdf_salt: "AAAA", p_wrapped_dek: "BBBB", p_wrap_iv: "CCCC", p_label: "Recovery code" };
    await rpcAdminRotatePrivateNoteRecovery(client, args);
    expect(rpc).toHaveBeenCalledWith("admin_rotate_private_note_recovery", args);
  });

  it("rpcAdminRemovePrivateNoteKeySlot -> admin_remove_private_note_key_slot", async () => {
    const { client, rpc } = clientReturning({ data: UUID, error: null });
    const args = { p_slot_id: UUID };
    await rpcAdminRemovePrivateNoteKeySlot(client, args);
    expect(rpc).toHaveBeenCalledWith("admin_remove_private_note_key_slot", args);
  });
});
