import { describe, expect, it, vi } from "vitest";

import { adminRpc } from "@/lib/admin/rpc";
import type { AppSupabaseClient } from "@/lib/supabase/types";

const UUID = "11111111-1111-1111-1111-111111111111";

function clientReturning(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => result);
  return { client: { rpc } as unknown as AppSupabaseClient, rpc };
}

describe("SC.4 RPC table rows pin the exact Postgres function name + args", () => {
  it("admin_enroll_private_note_keys passes through verbatim", async () => {
    const { client, rpc } = clientReturning({ data: UUID, error: null });
    const args = {
      p_dek_version: 1,
      p_slots: [
        {
          slot_type: "recovery",
          hkdf_salt: "AAAA",
          wrapped_dek: "BBBB",
          wrap_iv: "CCCC",
        },
      ],
    };
    await adminRpc(client, "admin_enroll_private_note_keys", args);
    expect(rpc).toHaveBeenCalledWith("admin_enroll_private_note_keys", args);
  });

  it("admin_upsert_shepherd_care_private_note passes through verbatim", async () => {
    const { client, rpc } = clientReturning({ data: UUID, error: null });
    const args = {
      p_care_profile_id: UUID,
      p_ciphertext: "AAAA",
      p_iv: "BBBB",
      p_dek_version: 1,
      p_set_body: true,
    };
    await adminRpc(client, "admin_upsert_shepherd_care_private_note", args);
    expect(rpc).toHaveBeenCalledWith(
      "admin_upsert_shepherd_care_private_note",
      args
    );
  });

  it("admin_add_private_note_key_slot passes through verbatim", async () => {
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
    await adminRpc(client, "admin_add_private_note_key_slot", args);
    expect(rpc).toHaveBeenCalledWith("admin_add_private_note_key_slot", args);
  });

  it("admin_rotate_private_note_recovery passes through verbatim", async () => {
    const { client, rpc } = clientReturning({ data: UUID, error: null });
    const args = {
      p_hkdf_salt: "AAAA",
      p_wrapped_dek: "BBBB",
      p_wrap_iv: "CCCC",
      p_label: "Recovery code",
    };
    await adminRpc(client, "admin_rotate_private_note_recovery", args);
    expect(rpc).toHaveBeenCalledWith(
      "admin_rotate_private_note_recovery",
      args
    );
  });

  it("admin_remove_private_note_key_slot passes through verbatim", async () => {
    const { client, rpc } = clientReturning({ data: UUID, error: null });
    const args = { p_slot_id: UUID };
    await adminRpc(client, "admin_remove_private_note_key_slot", args);
    expect(rpc).toHaveBeenCalledWith(
      "admin_remove_private_note_key_slot",
      args
    );
  });
});
