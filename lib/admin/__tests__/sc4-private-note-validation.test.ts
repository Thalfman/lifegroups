import { describe, expect, it } from "vitest";

import { mapRpcError } from "@/lib/admin/action-result";
import {
  validateEnrollPrivateNoteKeysPayload,
  validateUpsertShepherdCarePrivateNotePayload,
} from "@/lib/admin/validation";

const CARE = "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA";
// 12-byte IV and a >=16-byte ciphertext, base64 encoded.
const IV_B64 = "AAAAAAAAAAAAAAAA"; // 12 bytes of 0x00 -> 16 base64 chars
const CT_B64 = "AAAAAAAAAAAAAAAAAAAAAA=="; // 16 bytes of 0x00

describe("validateUpsertShepherdCarePrivateNotePayload", () => {
  it("accepts a well-formed body write and lowercases the care profile id", () => {
    const result = validateUpsertShepherdCarePrivateNotePayload({
      care_profile_id: CARE,
      set_body: "true",
      ciphertext: CT_B64,
      iv: IV_B64,
      dek_version: "1",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.care_profile_id).toBe(CARE.toLowerCase());
      expect(result.value.set_body).toBe(true);
      expect(result.value.ciphertext).toBe(CT_B64);
      expect(result.value.iv).toBe(IV_B64);
      expect(result.value.dek_version).toBe(1);
    }
  });

  it("rejects a non-uuid care profile id", () => {
    const result = validateUpsertShepherdCarePrivateNotePayload({
      care_profile_id: "not-a-uuid",
      set_body: true,
      ciphertext: CT_B64,
      iv: IV_B64,
      dek_version: 1,
    });
    expect(result.ok).toBe(false);
  });

  it("requires ciphertext and iv when set_body is true", () => {
    const result = validateUpsertShepherdCarePrivateNotePayload({
      care_profile_id: CARE,
      set_body: true,
      ciphertext: null,
      iv: null,
      dek_version: 1,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects ciphertext that is not valid base64", () => {
    const result = validateUpsertShepherdCarePrivateNotePayload({
      care_profile_id: CARE,
      set_body: true,
      ciphertext: "not base64!!!",
      iv: IV_B64,
      dek_version: 1,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a dek_version outside the smallint range", () => {
    for (const bad of [0, -1, 40000, "x"]) {
      const result = validateUpsertShepherdCarePrivateNotePayload({
        care_profile_id: CARE,
        set_body: true,
        ciphertext: CT_B64,
        iv: IV_B64,
        dek_version: bad,
      });
      expect(result.ok, `dek_version ${bad} should be rejected`).toBe(false);
    }
  });

  it("allows a no-body touch (set_body false) with null ciphertext/iv", () => {
    const result = validateUpsertShepherdCarePrivateNotePayload({
      care_profile_id: CARE,
      set_body: false,
      ciphertext: null,
      iv: null,
      dek_version: 1,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.set_body).toBe(false);
      expect(result.value.ciphertext).toBeNull();
      expect(result.value.iv).toBeNull();
    }
  });

  it("rejects ciphertext larger than the 1 MiB ceiling", () => {
    const huge = "A".repeat(2_000_000);
    const result = validateUpsertShepherdCarePrivateNotePayload({
      care_profile_id: CARE,
      set_body: true,
      ciphertext: huge,
      iv: IV_B64,
      dek_version: 1,
    });
    expect(result.ok).toBe(false);
  });
});

describe("validateEnrollPrivateNoteKeysPayload", () => {
  const recoverySlot = {
    slot_type: "recovery",
    credential_id: null,
    label: "Recovery code",
    prf_salt: null,
    hkdf_salt: "AAAA",
    wrapped_dek: "BBBB",
    wrap_iv: "CCCC",
  };
  const passkeySlot = {
    slot_type: "passkey",
    credential_id: "DDDD",
    label: "Windows Hello",
    prf_salt: "EEEE",
    hkdf_salt: "FFFF",
    wrapped_dek: "GGGG",
    wrap_iv: "HHHH",
  };

  it("accepts a recovery + passkey slot set", () => {
    const result = validateEnrollPrivateNoteKeysPayload({
      dek_version: 1,
      slots: [recoverySlot, passkeySlot],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.dek_version).toBe(1);
      expect(result.value.slots).toHaveLength(2);
    }
  });

  it("rejects a slot set with no recovery slot", () => {
    const result = validateEnrollPrivateNoteKeysPayload({ dek_version: 1, slots: [passkeySlot] });
    expect(result.ok).toBe(false);
  });

  it("rejects an empty slot set", () => {
    expect(validateEnrollPrivateNoteKeysPayload({ dek_version: 1, slots: [] }).ok).toBe(false);
  });

  it("rejects a slot missing required wrapped-DEK material", () => {
    const result = validateEnrollPrivateNoteKeysPayload({
      dek_version: 1,
      slots: [{ ...recoverySlot, wrapped_dek: null }],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown slot_type", () => {
    const result = validateEnrollPrivateNoteKeysPayload({
      dek_version: 1,
      slots: [{ ...recoverySlot, slot_type: "smartcard" }],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a dek_version outside the smallint range", () => {
    const result = validateEnrollPrivateNoteKeysPayload({ dek_version: 0, slots: [recoverySlot] });
    expect(result.ok).toBe(false);
  });
});

describe("SC.4 RPC error tokens map to friendly messages", () => {
  const generic = "Something went wrong saving that change. Try again in a moment.";

  it("maps missing_recovery_slot", () => {
    expect(mapRpcError("missing_recovery_slot")).not.toBe(generic);
  });

  it("maps already_enrolled", () => {
    expect(mapRpcError("already_enrolled")).not.toBe(generic);
  });
});
