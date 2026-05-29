import { describe, expect, it } from "vitest";

import {
  buildNoteAad,
  buildWrapAad,
  crockfordDecode,
  crockfordEncode,
  decryptNote,
  deriveKekFromPrf,
  deriveKekFromRecoveryCode,
  encryptNote,
  exportDekRaw,
  generateDek,
  generateRecoveryCode,
  importDekFromRaw,
  newHkdfSalt,
  unwrapDek,
  wrapDek,
} from "@/lib/crypto/private-notes";

const CARE = "11111111-1111-1111-1111-111111111111";
const CREATOR = "22222222-2222-2222-2222-222222222222";
const OTHER = "33333333-3333-3333-3333-333333333333";
const DEK_VERSION = 1;

const utf8 = (s: string) => new TextEncoder().encode(s);
const contains = (haystack: Uint8Array, needle: Uint8Array): boolean => {
  outer: for (let i = 0; i + needle.length <= haystack.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
};

describe("Crockford Base32 codec", () => {
  it("round-trips 32 random bytes", () => {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const round = crockfordDecode(crockfordEncode(bytes));
    expect(Array.from(round)).toEqual(Array.from(bytes));
  });

  it("encodes a single zero byte", () => {
    expect(crockfordEncode(new Uint8Array([0x00]))).toBe("00");
  });

  it("is case-insensitive and strips hyphens/spaces", () => {
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    const encoded = crockfordEncode(bytes);
    const grouped = (encoded.match(/.{1,4}/g) ?? []).join("-").toLowerCase();
    expect(Array.from(crockfordDecode(grouped))).toEqual(Array.from(bytes));
    expect(Array.from(crockfordDecode(`  ${encoded}  `))).toEqual(Array.from(bytes));
  });

  it("normalizes ambiguous characters (O->0, I/L->1)", () => {
    expect(Array.from(crockfordDecode("O0o"))).toEqual(Array.from(crockfordDecode("000")));
    expect(Array.from(crockfordDecode("IiLl"))).toEqual(Array.from(crockfordDecode("1111")));
  });
});

describe("recovery code", () => {
  it("generates a grouped 256-bit code that decodes to 32 bytes", () => {
    const code = generateRecoveryCode();
    expect(code).toContain("-");
    expect(crockfordDecode(code).length).toBe(32);
  });

  it("produces a different code each call", () => {
    expect(generateRecoveryCode()).not.toBe(generateRecoveryCode());
  });
});

describe("DEK generation and raw round-trip (re-wrappability foundation)", () => {
  it("generates a 256-bit (32-byte) key whose raw bytes round-trip through import/export", async () => {
    const dek = await generateDek();
    const raw = await exportDekRaw(dek);
    expect(raw.length).toBe(32);
    const reimported = await importDekFromRaw(raw);
    expect(Array.from(await exportDekRaw(reimported))).toEqual(Array.from(raw));
  });
});

describe("note encrypt/decrypt", () => {
  it("round-trips unicode plaintext", async () => {
    const dek = await generateDek();
    const aad = buildNoteAad(CARE, CREATOR, DEK_VERSION);
    const plaintext = "Pastoral note — confidential. 牧者 🙏";
    const { ciphertext, iv } = await encryptNote(dek, plaintext, aad);
    expect(iv.length).toBe(12);
    expect(ciphertext.length).toBe(utf8(plaintext).length + 16); // 128-bit tag appended
    expect(await decryptNote(dek, ciphertext, iv, aad)).toBe(plaintext);
  });

  it("does not contain the plaintext in the ciphertext bytes", async () => {
    const dek = await generateDek();
    const aad = buildNoteAad(CARE, CREATOR, DEK_VERSION);
    const secret = "KNOWN-PLAINTEXT-SECRET-12345";
    const { ciphertext } = await encryptNote(dek, secret, aad);
    expect(contains(ciphertext, utf8(secret))).toBe(false);
  });

  it("fails to decrypt when the AAD does not match", async () => {
    const dek = await generateDek();
    const aad = buildNoteAad(CARE, CREATOR, DEK_VERSION);
    const wrongAad = buildNoteAad(CARE, OTHER, DEK_VERSION);
    const { ciphertext, iv } = await encryptNote(dek, "secret", aad);
    await expect(decryptNote(dek, ciphertext, iv, wrongAad)).rejects.toThrow();
  });

  it("fails to decrypt tampered ciphertext", async () => {
    const dek = await generateDek();
    const aad = buildNoteAad(CARE, CREATOR, DEK_VERSION);
    const { ciphertext, iv } = await encryptNote(dek, "secret", aad);
    ciphertext[0] ^= 0xff;
    await expect(decryptNote(dek, ciphertext, iv, aad)).rejects.toThrow();
  });
});

describe("AAD construction", () => {
  it("excludes the note id and binds care/creator/version, case-insensitively", () => {
    const lower = buildNoteAad(CARE, CREATOR, DEK_VERSION);
    const upper = buildNoteAad(CARE.toUpperCase(), CREATOR.toUpperCase(), DEK_VERSION);
    expect(Array.from(lower)).toEqual(Array.from(upper));
    // Different creator or version yields different AAD bytes.
    expect(Array.from(buildNoteAad(CARE, OTHER, DEK_VERSION))).not.toEqual(Array.from(lower));
    expect(Array.from(buildNoteAad(CARE, CREATOR, 2))).not.toEqual(Array.from(lower));
  });
});

describe("DEK wrap/unwrap under a KEK", () => {
  it("round-trips: an unwrapped DEK decrypts what the original DEK encrypted", async () => {
    const dek = await generateDek();
    const kek = await deriveKekFromRecoveryCode(generateRecoveryCode(), newHkdfSalt());
    const wrapAad = buildWrapAad(CREATOR, DEK_VERSION);
    const noteAad = buildNoteAad(CARE, CREATOR, DEK_VERSION);

    const { wrapped, iv } = await wrapDek(dek, kek, wrapAad);
    expect(iv.length).toBe(12);
    const { ciphertext, iv: noteIv } = await encryptNote(dek, "secret", noteAad);

    const unwrapped = await unwrapDek(wrapped, iv, kek, wrapAad);
    expect(await decryptNote(unwrapped, ciphertext, noteIv, noteAad)).toBe("secret");
  });

  it("fails to unwrap with the wrong KEK", async () => {
    const dek = await generateDek();
    const kek = await deriveKekFromRecoveryCode(generateRecoveryCode(), newHkdfSalt());
    const wrongKek = await deriveKekFromRecoveryCode(generateRecoveryCode(), newHkdfSalt());
    const wrapAad = buildWrapAad(CREATOR, DEK_VERSION);
    const { wrapped, iv } = await wrapDek(dek, kek, wrapAad);
    await expect(unwrapDek(wrapped, iv, wrongKek, wrapAad)).rejects.toThrow();
  });

  it("fails to unwrap when the wrap AAD does not match", async () => {
    const dek = await generateDek();
    const kek = await deriveKekFromRecoveryCode(generateRecoveryCode(), newHkdfSalt());
    const { wrapped, iv } = await wrapDek(dek, kek, buildWrapAad(CREATOR, DEK_VERSION));
    await expect(unwrapDek(wrapped, iv, kek, buildWrapAad(OTHER, DEK_VERSION))).rejects.toThrow();
  });
});

describe("KEK derivation", () => {
  it("derives the same KEK from the same recovery code + salt (deterministic)", async () => {
    const code = generateRecoveryCode();
    const salt = newHkdfSalt();
    const dek = await generateDek();
    const wrapAad = buildWrapAad(CREATOR, DEK_VERSION);
    const { wrapped, iv } = await wrapDek(dek, await deriveKekFromRecoveryCode(code, salt), wrapAad);
    // A freshly derived KEK from the identical inputs must unwrap.
    const again = await deriveKekFromRecoveryCode(code, salt);
    await expect(unwrapDek(wrapped, iv, again, wrapAad)).resolves.toBeDefined();
  });

  it("derives a different KEK when the salt differs", async () => {
    const code = generateRecoveryCode();
    const dek = await generateDek();
    const wrapAad = buildWrapAad(CREATOR, DEK_VERSION);
    const { wrapped, iv } = await wrapDek(dek, await deriveKekFromRecoveryCode(code, newHkdfSalt()), wrapAad);
    const wrongSaltKek = await deriveKekFromRecoveryCode(code, newHkdfSalt());
    await expect(unwrapDek(wrapped, iv, wrongSaltKek, wrapAad)).rejects.toThrow();
  });

  it("derives a KEK from a PRF output deterministically", async () => {
    const prf = crypto.getRandomValues(new Uint8Array(32));
    const salt = newHkdfSalt();
    const dek = await generateDek();
    const wrapAad = buildWrapAad(CREATOR, DEK_VERSION);
    const { wrapped, iv } = await wrapDek(dek, await deriveKekFromPrf(prf, salt), wrapAad);
    const again = await deriveKekFromPrf(prf, salt);
    await expect(unwrapDek(wrapped, iv, again, wrapAad)).resolves.toBeDefined();
  });
});

describe("DEK is re-wrappable without re-encrypting notes (enables #113)", () => {
  it("re-wraps the same DEK under a new KEK; notes still decrypt via the new slot", async () => {
    const dek = await generateDek();
    const noteAad = buildNoteAad(CARE, CREATOR, DEK_VERSION);
    const wrapAad = buildWrapAad(CREATOR, DEK_VERSION);

    // Encrypt a note under the original DEK.
    const { ciphertext, iv: noteIv } = await encryptNote(dek, "secret", noteAad);

    // Slot 1: recovery code.
    const recoveryKek = await deriveKekFromRecoveryCode(generateRecoveryCode(), newHkdfSalt());
    const slot1 = await wrapDek(dek, recoveryKek, wrapAad);

    // Unwrap from slot 1, then re-wrap the SAME DEK under a new (PRF) KEK -- no note re-encryption.
    const recovered = await unwrapDek(slot1.wrapped, slot1.iv, recoveryKek, wrapAad);
    const prfKek = await deriveKekFromPrf(crypto.getRandomValues(new Uint8Array(32)), newHkdfSalt());
    const slot2 = await wrapDek(recovered, prfKek, wrapAad);

    // The original ciphertext decrypts via the DEK recovered from the NEW slot.
    const viaSlot2 = await unwrapDek(slot2.wrapped, slot2.iv, prfKek, wrapAad);
    expect(await decryptNote(viaSlot2, ciphertext, noteIv, noteAad)).toBe("secret");
  });
});
