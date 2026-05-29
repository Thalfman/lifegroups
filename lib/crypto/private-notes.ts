// SC.4 private care notes — the single, dependency-free client crypto module.
//
// This is the *verifiable surface*: the spec (docs/SC_4_PRIVATE_CARE_NOTES_SPEC.md
// §2.1, §6) and ADR-0003 commit to publishing this module's source hash per
// release. It builds ONLY on the Web Crypto API (globalThis.crypto.subtle) plus
// a tiny Crockford Base32 codec. It has NO transitive dependencies and never
// imports app/server code. Keep it that way: all SC.4 cryptography lives here.
//
// Cipher parameters (fixed): AES-256-GCM, fresh 12-byte random IV per
// encryption, 128-bit tag. KEK derivation (fixed): HKDF-SHA256, 16-byte
// per-slot salt, the fixed app `info` label below. No Argon2id / password KDF —
// every input secret is already high-entropy (32-byte PRF output or 256-bit
// recovery code), so HKDF derives a uniform KEK with no memory-hardness needed.
//
// AAD (fixed): note encryption binds (care_profile_id, created_by_profile_id,
// dek_version); DEK wrapping binds (created_by_profile_id, dek_version). Neither
// binds the DB-generated note id, which does not exist when a brand-new note is
// encrypted (spec §3, §6). Wrap AAD deliberately omits care_profile_id so the
// per-creator DEK is stable across every care profile and every key slot.
//
// Re-wrappability (hand-off contract for #113): the DEK is held as an
// EXTRACTABLE AES-GCM key. Wrapping exports its raw 32 bytes and AES-256-GCM
// encrypts them under the KEK; unwrapping decrypts and re-imports them as a
// fresh extractable key. This lets a new unlock method (a second passkey, a
// rotated recovery code) re-wrap the SAME DEK without re-encrypting any note.
// KEKs, by contrast, are non-extractable — they never need exporting.

const AES_GCM = "AES-GCM";
const KEY_BITS = 256;
const IV_BYTES = 12; // 96-bit GCM nonce
const HKDF_SALT_BYTES = 16;
const RECOVERY_CODE_BYTES = 32; // 256-bit
const DEK_RAW_BYTES = 32; // 256-bit

// Fixed HKDF `info` (domain separation). Changing this would invalidate every
// existing wrapped DEK, so it is pinned for the life of dek_version 1.
const KEK_INFO = new TextEncoder().encode("fvc-lifegroups/sc4-private-note-kek/v1");

const subtle = (): SubtleCrypto => globalThis.crypto.subtle;

// TS 5.7 narrowed BufferSource to ArrayBuffer-backed views. Every byte array in
// this module is ArrayBuffer-backed at runtime (no SharedArrayBuffer), so assert
// that at the Web Crypto boundary rather than copying.
function ab(b: Uint8Array): Uint8Array<ArrayBuffer> {
  return b as Uint8Array<ArrayBuffer>;
}

// ---------------------------------------------------------------------------
// Random material
// ---------------------------------------------------------------------------

export function newIv(): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
}

export function newHkdfSalt(): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(HKDF_SALT_BYTES));
}

// ---------------------------------------------------------------------------
// Crockford Base32 (recovery-code codec). Encodes the 256-bit recovery secret
// for human transcription; decode normalises the ambiguous characters so a
// typed code reproduces the same KEK regardless of case/grouping (spec §6).
// ---------------------------------------------------------------------------

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const CROCKFORD_DECODE: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  for (let i = 0; i < CROCKFORD.length; i += 1) map[CROCKFORD[i]] = i;
  map.O = 0; // O -> 0
  map.I = 1; // I -> 1
  map.L = 1; // L -> 1
  return map;
})();

export function crockfordEncode(bytes: Uint8Array): string {
  let out = "";
  let acc = 0;
  let bits = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += CROCKFORD[(acc >> bits) & 0x1f];
    }
  }
  if (bits > 0) {
    out += CROCKFORD[(acc << (5 - bits)) & 0x1f];
  }
  return out;
}

export function crockfordDecode(text: string): Uint8Array {
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  for (const ch of text.toUpperCase()) {
    const value = CROCKFORD_DECODE[ch];
    if (value === undefined) continue; // skip hyphens, spaces, stray characters
    acc = (acc << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

export function generateRecoveryCode(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(RECOVERY_CODE_BYTES));
  const encoded = crockfordEncode(bytes);
  return (encoded.match(/.{1,5}/g) ?? []).join("-");
}

// ---------------------------------------------------------------------------
// Additional Authenticated Data (AAD). Built from row context known to the
// client before the first insert; UUIDs are lower-cased so encrypt-time and
// decrypt-time AAD match regardless of input casing.
// ---------------------------------------------------------------------------

export function buildNoteAad(
  careProfileId: string,
  createdByProfileId: string,
  dekVersion: number,
): Uint8Array {
  return new TextEncoder().encode(
    `sc4-note|${careProfileId.toLowerCase()}|${createdByProfileId.toLowerCase()}|${dekVersion}`,
  );
}

export function buildWrapAad(createdByProfileId: string, dekVersion: number): Uint8Array {
  return new TextEncoder().encode(`sc4-dek|${createdByProfileId.toLowerCase()}|${dekVersion}`);
}

// ---------------------------------------------------------------------------
// Data-Encryption-Key (DEK)
// ---------------------------------------------------------------------------

export function generateDek(): Promise<CryptoKey> {
  return subtle().generateKey({ name: AES_GCM, length: KEY_BITS }, true, ["encrypt", "decrypt"]);
}

export function importDekFromRaw(raw: Uint8Array): Promise<CryptoKey> {
  return subtle().importKey("raw", ab(raw), { name: AES_GCM }, true, ["encrypt", "decrypt"]);
}

export async function exportDekRaw(dek: CryptoKey): Promise<Uint8Array> {
  return new Uint8Array(await subtle().exportKey("raw", dek));
}

// ---------------------------------------------------------------------------
// KEK derivation (HKDF-SHA256 over a high-entropy secret)
// ---------------------------------------------------------------------------

async function deriveKek(secret: Uint8Array, hkdfSalt: Uint8Array): Promise<CryptoKey> {
  const base = await subtle().importKey("raw", ab(secret), "HKDF", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: ab(hkdfSalt), info: ab(KEK_INFO) },
    base,
    { name: AES_GCM, length: KEY_BITS },
    false, // KEK is never exported
    ["encrypt", "decrypt"],
  );
}

export function deriveKekFromPrf(
  prfOutput: ArrayBuffer | Uint8Array,
  hkdfSalt: Uint8Array,
): Promise<CryptoKey> {
  const bytes = prfOutput instanceof Uint8Array ? prfOutput : new Uint8Array(prfOutput);
  return deriveKek(bytes, hkdfSalt);
}

export function deriveKekFromRecoveryCode(code: string, hkdfSalt: Uint8Array): Promise<CryptoKey> {
  return deriveKek(crockfordDecode(code), hkdfSalt);
}

// ---------------------------------------------------------------------------
// DEK wrap / unwrap (raw-bytes under the KEK, AES-256-GCM)
// ---------------------------------------------------------------------------

export async function wrapDek(
  dek: CryptoKey,
  kek: CryptoKey,
  aad: Uint8Array,
): Promise<{ wrapped: Uint8Array; iv: Uint8Array }> {
  const raw = await exportDekRaw(dek);
  const iv = newIv();
  const wrapped = new Uint8Array(
    await subtle().encrypt({ name: AES_GCM, iv: ab(iv), additionalData: ab(aad) }, kek, ab(raw)),
  );
  return { wrapped, iv };
}

export async function unwrapDek(
  wrapped: Uint8Array,
  iv: Uint8Array,
  kek: CryptoKey,
  aad: Uint8Array,
): Promise<CryptoKey> {
  const raw = new Uint8Array(
    await subtle().decrypt({ name: AES_GCM, iv: ab(iv), additionalData: ab(aad) }, kek, ab(wrapped)),
  );
  if (raw.length !== DEK_RAW_BYTES) {
    throw new Error("unwrapDek: unexpected DEK length");
  }
  return importDekFromRaw(raw);
}

// ---------------------------------------------------------------------------
// Note encrypt / decrypt (AES-256-GCM, 12-byte IV, 128-bit tag, context AAD)
// ---------------------------------------------------------------------------

export async function encryptNote(
  dek: CryptoKey,
  plaintext: string,
  aad: Uint8Array,
): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> {
  const iv = newIv();
  const ciphertext = new Uint8Array(
    await subtle().encrypt(
      { name: AES_GCM, iv: ab(iv), additionalData: ab(aad) },
      dek,
      ab(new TextEncoder().encode(plaintext)),
    ),
  );
  return { ciphertext, iv };
}

export async function decryptNote(
  dek: CryptoKey,
  ciphertext: Uint8Array,
  iv: Uint8Array,
  aad: Uint8Array,
): Promise<string> {
  const plaintext = await subtle().decrypt(
    { name: AES_GCM, iv: ab(iv), additionalData: ab(aad) },
    dek,
    ab(ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}

// ---------------------------------------------------------------------------
// WebAuthn passkey (PRF extension). Browser-only: these touch
// navigator.credentials and are exercised manually / in the browser, not in the
// node unit suite. The PRF output is used purely as a hardware-bound secret to
// derive a KEK — no assertion is verified server-side — so a random client
// challenge is sufficient.
// ---------------------------------------------------------------------------

type PrfExtensionInput = {
  prf?: { eval?: { first: BufferSource }; evalByCredential?: Record<string, { first: BufferSource }> };
};

type PrfExtensionOutput = {
  prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } };
};

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return globalThis.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function isPrfPasskeySupported(): boolean {
  return (
    typeof globalThis !== "undefined" &&
    typeof globalThis.PublicKeyCredential !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.credentials
  );
}

export type RegisterPasskeyOptions = {
  rpId: string;
  rpName: string;
  userId: Uint8Array;
  userName: string;
  userDisplayName: string;
  prfSalt?: Uint8Array;
};

/**
 * Register a WebAuthn passkey with the PRF extension. Returns the credential id
 * and the per-credential PRF salt. The PRF output is obtained separately via
 * evaluatePrf (`evalByCredential`), because create-time `eval` does not reliably
 * return PRF output once more than one passkey can exist (spec §6).
 */
export async function registerPrfPasskey(
  opts: RegisterPasskeyOptions,
): Promise<{ credentialId: Uint8Array; prfSalt: Uint8Array }> {
  const prfSalt = opts.prfSalt ?? globalThis.crypto.getRandomValues(new Uint8Array(RECOVERY_CODE_BYTES));
  const challenge = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const prfExtension: PrfExtensionInput = { prf: { eval: { first: ab(prfSalt) } } };
  const publicKey: PublicKeyCredentialCreationOptions = {
    challenge: ab(challenge),
    rp: { id: opts.rpId, name: opts.rpName },
    user: { id: ab(opts.userId), name: opts.userName, displayName: opts.userDisplayName },
    pubKeyCredParams: [
      { type: "public-key", alg: -7 }, // ES256
      { type: "public-key", alg: -257 }, // RS256
    ],
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
    extensions: prfExtension as unknown as AuthenticationExtensionsClientInputs,
  };
  const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
  if (!credential) throw new Error("registerPrfPasskey: no credential created");
  return { credentialId: new Uint8Array(credential.rawId), prfSalt };
}

/**
 * Evaluate the passkey PRF for a known credential id, returning the 32-byte PRF
 * output that feeds deriveKekFromPrf. Keyed by credential id via
 * `evalByCredential` (spec §6).
 */
export async function evaluatePrf(
  credentialId: Uint8Array,
  prfSalt: Uint8Array,
  rpId: string,
): Promise<ArrayBuffer> {
  const challenge = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const prfExtension: PrfExtensionInput = {
    prf: { evalByCredential: { [bytesToBase64Url(credentialId)]: { first: ab(prfSalt) } } },
  };
  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge: ab(challenge),
    rpId,
    allowCredentials: [{ type: "public-key", id: ab(credentialId) }],
    userVerification: "required",
    extensions: prfExtension as unknown as AuthenticationExtensionsClientInputs,
  };
  const assertion = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
  if (!assertion) throw new Error("evaluatePrf: no assertion returned");
  const ext = assertion.getClientExtensionResults() as unknown as PrfExtensionOutput;
  const result = ext.prf?.results?.first;
  if (!result) throw new Error("evaluatePrf: authenticator returned no PRF output");
  return result;
}
