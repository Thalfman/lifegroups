import { describe, expect, it } from "vitest";

import { mapRpcError } from "@/lib/admin/action-result";
import { bytesToBase64 } from "@/lib/crypto/encoding";
import {
  validateAddPrivateNoteKeySlotPayload,
  validateRemovePrivateNoteKeySlotPayload,
  validateRotatePrivateNoteRecoveryPayload,
} from "@/lib/admin/validation";

const b64 = (n: number) => bytesToBase64(new Uint8Array(n));
const SLOT_ID = "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA";

const passkeyFields = {
  credential_id: b64(20),
  label: "Phone passkey",
  prf_salt: b64(32),
  hkdf_salt: b64(16),
  wrapped_dek: b64(48),
  wrap_iv: b64(12),
};

describe("validateAddPrivateNoteKeySlotPayload", () => {
  it("accepts a well-formed passkey slot", () => {
    const result = validateAddPrivateNoteKeySlotPayload(passkeyFields);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.credential_id).toBe(passkeyFields.credential_id);
      expect(result.value.prf_salt).toBe(passkeyFields.prf_salt);
    }
  });

  it("requires the passkey credential id and PRF salt", () => {
    expect(validateAddPrivateNoteKeySlotPayload({ ...passkeyFields, credential_id: null }).ok).toBe(
      false,
    );
    expect(validateAddPrivateNoteKeySlotPayload({ ...passkeyFields, prf_salt: null }).ok).toBe(false);
  });

  it("rejects wrong-length wrapped-key material", () => {
    expect(validateAddPrivateNoteKeySlotPayload({ ...passkeyFields, wrapped_dek: b64(32) }).ok).toBe(
      false,
    );
    expect(validateAddPrivateNoteKeySlotPayload({ ...passkeyFields, wrap_iv: b64(16) }).ok).toBe(false);
    expect(validateAddPrivateNoteKeySlotPayload({ ...passkeyFields, prf_salt: b64(16) }).ok).toBe(false);
  });
});

describe("validateRotatePrivateNoteRecoveryPayload", () => {
  const fields = { hkdf_salt: b64(16), wrapped_dek: b64(48), wrap_iv: b64(12), label: "Recovery code" };

  it("accepts well-formed recovery material", () => {
    const result = validateRotatePrivateNoteRecoveryPayload(fields);
    expect(result.ok).toBe(true);
  });

  it("rejects wrong-length material", () => {
    expect(validateRotatePrivateNoteRecoveryPayload({ ...fields, hkdf_salt: b64(8) }).ok).toBe(false);
    expect(validateRotatePrivateNoteRecoveryPayload({ ...fields, wrapped_dek: b64(64) }).ok).toBe(false);
  });
});

describe("validateRemovePrivateNoteKeySlotPayload", () => {
  it("accepts a uuid slot id and lowercases it", () => {
    const result = validateRemovePrivateNoteKeySlotPayload({ slot_id: SLOT_ID });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.slot_id).toBe(SLOT_ID.toLowerCase());
  });

  it("rejects a non-uuid slot id", () => {
    expect(validateRemovePrivateNoteKeySlotPayload({ slot_id: "nope" }).ok).toBe(false);
  });
});

describe("SC.4 lifecycle RPC error tokens map to friendly messages", () => {
  const generic = "Something went wrong saving that change. Try again in a moment.";
  it("maps missing_slot and cannot_remove_last_slot", () => {
    expect(mapRpcError("missing_slot")).not.toBe(generic);
    expect(mapRpcError("cannot_remove_last_slot")).not.toBe(generic);
  });
});
