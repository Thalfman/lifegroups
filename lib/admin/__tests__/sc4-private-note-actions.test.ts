import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireAdminSession, mockCreateClient, mockRevalidatePath } = vi.hoisted(() => ({
  mockRequireAdminSession: vi.fn(),
  mockCreateClient: vi.fn(),
  mockRevalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireAdminSession: mockRequireAdminSession }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mockCreateClient }));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
vi.mock("@/lib/observability/logger", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { bytesToBase64 } from "@/lib/crypto/encoding";
import {
  adminAddPrivateNoteKeySlot,
  adminEnrollPrivateNoteKeys,
  adminRemovePrivateNoteKeySlot,
  adminRotatePrivateNoteRecovery,
  adminUpsertShepherdCarePrivateNote,
} from "@/app/(protected)/admin/shepherd-care/actions";

const b64 = (n: number) => bytesToBase64(new Uint8Array(n));

const ACTOR = "11111111-1111-1111-1111-111111111111";
const NOTE_ID = "22222222-2222-2222-2222-222222222222";
const CARE = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SHEPHERD = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

let rpc: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  rpc = vi.fn(async () => ({ data: NOTE_ID, error: null }));
  mockRequireAdminSession.mockResolvedValue({
    ok: true,
    session: { profile: { id: ACTOR, role: "ministry_admin" } },
  });
  mockCreateClient.mockResolvedValue({ rpc });
});

describe("adminUpsertShepherdCarePrivateNote", () => {
  it("maps the validated payload to the RPC and revalidates the shepherd detail path", async () => {
    const result = await adminUpsertShepherdCarePrivateNote(undefined, {
      care_profile_id: CARE,
      set_body: true,
      ciphertext: "AAAA",
      iv: "AAAAAAAAAAAAAAAA",
      dek_version: 1,
      shepherd_profile_id: SHEPHERD,
    });

    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("admin_upsert_shepherd_care_private_note", {
      p_care_profile_id: CARE,
      p_ciphertext: "AAAA",
      p_iv: "AAAAAAAAAAAAAAAA",
      p_dek_version: 1,
      p_set_body: true,
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/admin/shepherd-care/${SHEPHERD}`);
  });
});

describe("adminEnrollPrivateNoteKeys", () => {
  it("maps the validated slots to the RPC and revalidates the shepherd detail path", async () => {
    const slot = {
      slot_type: "recovery" as const,
      credential_id: null,
      label: "Recovery code",
      prf_salt: null,
      hkdf_salt: b64(16),
      wrapped_dek: b64(48),
      wrap_iv: b64(12),
    };

    const result = await adminEnrollPrivateNoteKeys(undefined, {
      dek_version: 1,
      slots: [slot],
      shepherd_profile_id: SHEPHERD,
    });

    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("admin_enroll_private_note_keys", {
      p_dek_version: 1,
      p_slots: [slot],
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/admin/shepherd-care/${SHEPHERD}`);
  });
});

describe("adminAddPrivateNoteKeySlot", () => {
  it("maps a passkey slot to the RPC (slot_type forced passkey) and revalidates", async () => {
    const result = await adminAddPrivateNoteKeySlot(undefined, {
      credential_id: b64(20),
      label: "Phone",
      prf_salt: b64(32),
      hkdf_salt: b64(16),
      wrapped_dek: b64(48),
      wrap_iv: b64(12),
      shepherd_profile_id: SHEPHERD,
    });
    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("admin_add_private_note_key_slot", {
      p_slot_type: "passkey",
      p_credential_id: b64(20),
      p_label: "Phone",
      p_prf_salt: b64(32),
      p_hkdf_salt: b64(16),
      p_wrapped_dek: b64(48),
      p_wrap_iv: b64(12),
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/admin/shepherd-care/${SHEPHERD}`);
  });
});

describe("adminRotatePrivateNoteRecovery", () => {
  it("maps recovery material to the RPC and revalidates", async () => {
    const result = await adminRotatePrivateNoteRecovery(undefined, {
      hkdf_salt: b64(16),
      wrapped_dek: b64(48),
      wrap_iv: b64(12),
      label: "Recovery code",
      shepherd_profile_id: SHEPHERD,
    });
    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("admin_rotate_private_note_recovery", {
      p_hkdf_salt: b64(16),
      p_wrapped_dek: b64(48),
      p_wrap_iv: b64(12),
      p_label: "Recovery code",
    });
  });
});

describe("adminRemovePrivateNoteKeySlot", () => {
  it("maps the slot id to the RPC and revalidates", async () => {
    const result = await adminRemovePrivateNoteKeySlot(undefined, {
      slot_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
      shepherd_profile_id: SHEPHERD,
    });
    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("admin_remove_private_note_key_slot", {
      p_slot_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    });
  });
});
