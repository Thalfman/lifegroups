import { isUuid } from "@/lib/shared/uuid";
import { base64ToBytes } from "@/lib/crypto/encoding";
import type { ValidationResult } from "./shared";
import {
  isRecord,
  readOptionalString,
  normalizeUuid,
  readBooleanFlag,
  makeIdPayloadValidator,
} from "./shared";

// ----- Phase SC.4 — private care note (encrypted body upsert) -------------

// Base64 of arbitrary bytes: standard alphabet, optional padding, length a
// multiple of 4. Content-blind — the body is opaque ciphertext to the server.
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

// 1 MiB of ciphertext -> ~1.4M base64 chars; cap generously. The RPC enforces
// the authoritative octet bounds; this is content-free defense-in-depth.
const MAX_CIPHERTEXT_BASE64 = 1_500_000;

function isBase64Blob(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length % 4 === 0 &&
    BASE64_RE.test(value)
  );
}

export type UpsertShepherdCarePrivateNotePayload = {
  care_profile_id: string;
  set_body: boolean;
  ciphertext: string | null;
  iv: string | null;
  dek_version: number;
};

export function validateUpsertShepherdCarePrivateNotePayload(
  input: unknown
): ValidationResult<UpsertShepherdCarePrivateNotePayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  if (!isUuid(input.care_profile_id)) {
    errors.push("care_profile_id must be a uuid");
  }

  const dekVersion =
    typeof input.dek_version === "number"
      ? input.dek_version
      : Number(input.dek_version);
  if (!Number.isInteger(dekVersion) || dekVersion < 1 || dekVersion > 32767) {
    errors.push("dek_version must be a positive smallint.");
  }

  const setBody = readBooleanFlag(input.set_body);
  let ciphertext: string | null = null;
  let iv: string | null = null;

  if (setBody) {
    if (!isBase64Blob(input.ciphertext)) {
      errors.push("Encrypted note body is missing or malformed.");
    } else if (input.ciphertext.length > MAX_CIPHERTEXT_BASE64) {
      errors.push("Encrypted note body is too large.");
    } else {
      ciphertext = input.ciphertext;
    }
    if (!isBase64Blob(input.iv)) {
      errors.push("Encryption nonce is missing or malformed.");
    } else {
      iv = input.iv;
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      care_profile_id: normalizeUuid(input.care_profile_id as string),
      set_body: setBody,
      ciphertext,
      iv,
      dek_version: dekVersion,
    },
  };
}

export type PrivateNoteKeySlotInput = {
  slot_type: "passkey" | "recovery";
  credential_id: string | null;
  label: string | null;
  prf_salt: string | null;
  hkdf_salt: string;
  wrapped_dek: string;
  wrap_iv: string;
};

export type EnrollPrivateNoteKeysPayload = {
  dek_version: number;
  slots: PrivateNoteKeySlotInput[];
};

function isOptionalBase64(value: unknown): value is string | null {
  return value === null || value === undefined || isBase64Blob(value);
}

// Fixed byte lengths the crypto module always produces (lib/crypto/private-notes.ts):
// HKDF salt 16, GCM nonce 12, wrapped DEK 48 (32-byte DEK + 16-byte tag), PRF
// salt 32. Reject anything else so a malformed slot can't be persisted and then
// permanently lock the creator out behind the once-per-creator enroll guard.
const HKDF_SALT_BYTES = 16;
const WRAP_IV_BYTES = 12;
const WRAPPED_DEK_BYTES = 48;
const PRF_SALT_BYTES = 32;
const MAX_CREDENTIAL_ID_BYTES = 1024;

function isBase64OfLength(value: string, bytes: number): boolean {
  return base64ToBytes(value).length === bytes;
}

function validateKeySlot(
  raw: unknown,
  index: number,
  errors: string[]
): PrivateNoteKeySlotInput | null {
  if (!isRecord(raw)) {
    errors.push(`Key slot ${index} is malformed.`);
    return null;
  }
  const slotType = raw.slot_type;
  if (slotType !== "passkey" && slotType !== "recovery") {
    errors.push(`Key slot ${index} has an unknown type.`);
    return null;
  }
  if (
    !isBase64Blob(raw.hkdf_salt) ||
    !isBase64Blob(raw.wrapped_dek) ||
    !isBase64Blob(raw.wrap_iv)
  ) {
    errors.push(`Key slot ${index} is missing wrapped-key material.`);
    return null;
  }
  if (
    !isBase64OfLength(raw.hkdf_salt, HKDF_SALT_BYTES) ||
    !isBase64OfLength(raw.wrap_iv, WRAP_IV_BYTES) ||
    !isBase64OfLength(raw.wrapped_dek, WRAPPED_DEK_BYTES)
  ) {
    errors.push(
      `Key slot ${index} has wrapped-key material of the wrong size.`
    );
    return null;
  }
  if (!isOptionalBase64(raw.credential_id) || !isOptionalBase64(raw.prf_salt)) {
    errors.push(`Key slot ${index} has malformed passkey material.`);
    return null;
  }
  if (
    typeof raw.prf_salt === "string" &&
    !isBase64OfLength(raw.prf_salt, PRF_SALT_BYTES)
  ) {
    errors.push(`Key slot ${index} has a PRF salt of the wrong size.`);
    return null;
  }
  if (
    typeof raw.credential_id === "string" &&
    base64ToBytes(raw.credential_id).length > MAX_CREDENTIAL_ID_BYTES
  ) {
    errors.push(`Key slot ${index} has an oversized credential id.`);
    return null;
  }
  return {
    slot_type: slotType,
    credential_id:
      typeof raw.credential_id === "string" ? raw.credential_id : null,
    label: readOptionalString(raw.label) ?? null,
    prf_salt: typeof raw.prf_salt === "string" ? raw.prf_salt : null,
    hkdf_salt: raw.hkdf_salt,
    wrapped_dek: raw.wrapped_dek,
    wrap_iv: raw.wrap_iv,
  };
}

export function validateEnrollPrivateNoteKeysPayload(
  input: unknown
): ValidationResult<EnrollPrivateNoteKeysPayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  const dekVersion =
    typeof input.dek_version === "number"
      ? input.dek_version
      : Number(input.dek_version);
  if (!Number.isInteger(dekVersion) || dekVersion < 1 || dekVersion > 32767) {
    errors.push("dek_version must be a positive smallint.");
  }

  if (!Array.isArray(input.slots) || input.slots.length === 0) {
    errors.push("At least one unlock method is required.");
    return { ok: false, errors };
  }

  const slots: PrivateNoteKeySlotInput[] = [];
  let recoveryCount = 0;
  input.slots.forEach((raw, index) => {
    const slot = validateKeySlot(raw, index, errors);
    if (slot) {
      slots.push(slot);
      if (slot.slot_type === "recovery") recoveryCount += 1;
    }
  });

  if (recoveryCount === 0) {
    errors.push("A recovery code is required as a backup unlock method.");
  }

  if (errors.length > 0) return { ok: false, errors };

  return { ok: true, value: { dek_version: dekVersion, slots } };
}

// ----- Phase SC.4 (#113) — key-slot lifecycle --------------------------------

export type AddPrivateNoteKeySlotPayload = {
  credential_id: string;
  label: string | null;
  prf_salt: string;
  hkdf_salt: string;
  wrapped_dek: string;
  wrap_iv: string;
};

// Adds a passkey slot (recovery is rotated, not added). Reuses the fixed-length
// rules from the enroll validator.
export function validateAddPrivateNoteKeySlotPayload(
  input: unknown
): ValidationResult<AddPrivateNoteKeySlotPayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  if (
    !isBase64Blob(input.credential_id) ||
    base64ToBytes(input.credential_id).length > MAX_CREDENTIAL_ID_BYTES
  ) {
    errors.push("Passkey credential id is missing or malformed.");
  }
  if (
    !isBase64Blob(input.prf_salt) ||
    !isBase64OfLength(input.prf_salt, PRF_SALT_BYTES)
  ) {
    errors.push("Passkey PRF salt is missing or the wrong size.");
  }
  if (
    !isBase64Blob(input.hkdf_salt) ||
    !isBase64OfLength(input.hkdf_salt, HKDF_SALT_BYTES)
  ) {
    errors.push("HKDF salt is missing or the wrong size.");
  }
  if (
    !isBase64Blob(input.wrapped_dek) ||
    !isBase64OfLength(input.wrapped_dek, WRAPPED_DEK_BYTES)
  ) {
    errors.push("Wrapped key is missing or the wrong size.");
  }
  if (
    !isBase64Blob(input.wrap_iv) ||
    !isBase64OfLength(input.wrap_iv, WRAP_IV_BYTES)
  ) {
    errors.push("Wrap nonce is missing or the wrong size.");
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      credential_id: input.credential_id as string,
      label: readOptionalString(input.label) ?? null,
      prf_salt: input.prf_salt as string,
      hkdf_salt: input.hkdf_salt as string,
      wrapped_dek: input.wrapped_dek as string,
      wrap_iv: input.wrap_iv as string,
    },
  };
}

export type RotatePrivateNoteRecoveryPayload = {
  hkdf_salt: string;
  wrapped_dek: string;
  wrap_iv: string;
  label: string | null;
};

export function validateRotatePrivateNoteRecoveryPayload(
  input: unknown
): ValidationResult<RotatePrivateNoteRecoveryPayload> {
  const errors: string[] = [];
  if (!isRecord(input))
    return { ok: false, errors: ["payload must be an object"] };

  if (
    !isBase64Blob(input.hkdf_salt) ||
    !isBase64OfLength(input.hkdf_salt, HKDF_SALT_BYTES)
  ) {
    errors.push("HKDF salt is missing or the wrong size.");
  }
  if (
    !isBase64Blob(input.wrapped_dek) ||
    !isBase64OfLength(input.wrapped_dek, WRAPPED_DEK_BYTES)
  ) {
    errors.push("Wrapped key is missing or the wrong size.");
  }
  if (
    !isBase64Blob(input.wrap_iv) ||
    !isBase64OfLength(input.wrap_iv, WRAP_IV_BYTES)
  ) {
    errors.push("Wrap nonce is missing or the wrong size.");
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      hkdf_salt: input.hkdf_salt as string,
      wrapped_dek: input.wrapped_dek as string,
      wrap_iv: input.wrap_iv as string,
      label: readOptionalString(input.label) ?? null,
    },
  };
}

export type RemovePrivateNoteKeySlotPayload = {
  slot_id: string;
};

export const validateRemovePrivateNoteKeySlotPayload: (
  input: unknown
) => ValidationResult<RemovePrivateNoteKeySlotPayload> =
  makeIdPayloadValidator("slot_id");
