# SC.4 — Hand-off contract (built in #112)

The stable surface #113 and #114 bind to. Produced by the #112 tracer bullet
(`claude/sc4-112-tracer-private-notes`). Authoritative design stays
[`SC_4_PRIVATE_CARE_NOTES_SPEC.md`](./SC_4_PRIVATE_CARE_NOTES_SPEC.md) /
[`adr/0003`](./adr/0003-private-care-note-encryption.md); this records what was
actually built and the deviations to reconcile against.

## 1. Crypto module public API (the verifiable surface)

`lib/crypto/private-notes.ts` — dependency-free, WebCrypto-only. Do **not**
duplicate these in #113/#114; reuse them.

```ts
// Random material
newIv(): Uint8Array                    // 12-byte GCM nonce
newHkdfSalt(): Uint8Array              // 16-byte per-slot HKDF salt

// Crockford Base32 (recovery code)
crockfordEncode(bytes: Uint8Array): string
crockfordDecode(text: string): Uint8Array        // normalises O->0, I/L->1; strips hyphens/spaces; case-insensitive
generateRecoveryCode(): string                   // 256-bit -> Crockford, grouped in 5s with hyphens

// AAD (see §4)
buildNoteAad(careProfileId, createdByProfileId, dekVersion): Uint8Array
buildWrapAad(createdByProfileId, dekVersion): Uint8Array

// DEK (held as an EXTRACTABLE AES-256-GCM key so it can be re-wrapped — see §5)
generateDek(): Promise<CryptoKey>
importDekFromRaw(raw: Uint8Array): Promise<CryptoKey>
exportDekRaw(dek: CryptoKey): Promise<Uint8Array>

// KEK derivation (HKDF-SHA256, non-extractable AES-256-GCM KEK)
deriveKekFromPrf(prfOutput: ArrayBuffer | Uint8Array, hkdfSalt: Uint8Array): Promise<CryptoKey>
deriveKekFromRecoveryCode(code: string, hkdfSalt: Uint8Array): Promise<CryptoKey>

// Wrap / unwrap the DEK (AES-256-GCM over the raw DEK bytes)
wrapDek(dek, kek, aad): Promise<{ wrapped: Uint8Array; iv: Uint8Array }>
unwrapDek(wrapped, iv, kek, aad): Promise<CryptoKey>   // returns an extractable DEK

// Note encrypt / decrypt (AES-256-GCM, 12-byte IV, 128-bit tag, context AAD)
encryptNote(dek, plaintext: string, aad): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }>
decryptNote(dek, ciphertext, iv, aad): Promise<string>

// WebAuthn PRF (browser-only)
isPrfPasskeySupported(): boolean
registerPrfPasskey(opts): Promise<{ credentialId: Uint8Array; prfSalt: Uint8Array }>
evaluatePrf(credentialId: Uint8Array, prfSalt: Uint8Array, rpId: string): Promise<ArrayBuffer>
```

`lib/crypto/encoding.ts` — non-cryptographic transport codecs (kept out of the
verifiable surface): `bytesToBase64`, `base64ToBytes`, `pgHexToBytes`,
`pgHexToBase64`.

**Cipher parameters (fixed):** AES-256-GCM, fresh 12-byte random IV per
encryption, 128-bit tag. **KEK:** HKDF-SHA256, 16-byte per-slot salt, fixed
`info` = `"fvc-lifegroups/sc4-private-note-kek/v1"`. No Argon2id.

## 2. Final table schemas (as built)

`supabase/migrations/20260529008000_phase_sc4_private_care_notes.sql`. Columns
match spec §3 exactly.

- `shepherd_care_private_notes(id, care_profile_id, created_by_profile_id, ciphertext bytea, iv bytea, dek_version smallint default 1, created_at, updated_at)` — unique `(care_profile_id, created_by_profile_id)`.
- `shepherd_care_note_key_slots(id, created_by_profile_id, dek_version smallint default 1, slot_type text check in ('passkey','recovery'), credential_id bytea, label text, prf_salt bytea, hkdf_salt bytea, wrapped_dek bytea, wrap_iv bytea, created_at)` — index on `created_by_profile_id`; **partial unique** `(created_by_profile_id, dek_version) where slot_type = 'recovery'` (one recovery slot per generation; #113's rotate replaces it).

Both: creator-scoped RLS `auth_role() = 'ministry_admin'::public.user_role AND created_by_profile_id = public.auth_profile_id()`; SELECT-only grant; no write policies; super_admin excluded.

## 3. Wrapped-DEK slot-record shape (the `p_slots` jsonb element)

The enroll RPC and #113's add/rotate RPCs consume slot objects with **base64**
bytea fields:

```jsonc
{
  "slot_type": "recovery" | "passkey",
  "credential_id": <base64> | null,   // passkey only
  "label": <string> | null,
  "prf_salt": <base64> | null,        // passkey only
  "hkdf_salt": <base64>,              // required
  "wrapped_dek": <base64>,            // required
  "wrap_iv": <base64>                 // required
}
```

Read back via `fetchPrivateNoteKeySlotsForCreator` as `PrivateNoteKeySlot` with
the same fields **base64-encoded** (read model normalises PG hex -> base64).

## 4. AAD construction (fixed)

UUIDs are lower-cased; the DB-generated note id is **deliberately excluded**.

- Note AAD = UTF-8 of `sc4-note|<careProfileId>|<createdByProfileId>|<dekVersion>`
- Wrap AAD = UTF-8 of `sc4-dek|<createdByProfileId>|<dekVersion>` (no care profile id, so the per-creator DEK is stable across every care profile and every slot).

Crockford Base32: alphabet `0123456789ABCDEFGHJKMNPQRSTVWXYZ`; decode maps
`O->0`, `I->1`, `L->1`, strips hyphens/spaces, case-insensitive.

## 5. DEK-stays-re-wrappable decision

The DEK is generated/imported **extractable** (raw 32 bytes). `wrapDek` exports
the raw bytes and AES-256-GCM-encrypts them under the KEK; `unwrapDek` decrypts
and re-imports as a fresh extractable key. So a new unlock method (#113's second
passkey, rotated recovery code) re-wraps the SAME DEK with no note
re-encryption. KEKs are non-extractable.

## 6. Deviations from the spec (reconcile in #113/#114)

1. **`admin_enroll_private_note_keys` returns `uuid` (the mandatory recovery
   slot id), not `void`.** This lets it flow through the standard
   `runAdminWriteAction` runner (which treats a void/null return as failure),
   matching every sibling care RPC. It leaks nothing — the id is a random slot
   id the creator already owns. `callVoidRpc` was therefore not added in #112;
   add it in #113 only if a genuinely void RPC (e.g. remove-slot) is built, or
   have that RPC return the affected slot id too.
2. **Bytea wire contract.** RPC bytea params are declared `text` and decoded
   with `decode(arg, 'base64')`; PostgREST cannot coerce JSON into bytea. Reads
   come back as PG hex and are normalised to base64 in the read model
   (`byteaToBase64`). The whole app/client layer speaks base64.
3. **Transport codecs split out** into `lib/crypto/encoding.ts` to keep the
   published-hash crypto surface (`private-notes.ts`) focused on cryptography.
4. **AAD excludes the note id.** Matches spec §3/§6; supersedes the #112 brief's
   "Key interfaces" parenthetical that listed "note id + creator + dek_version".

## 6a. Post-review hardening (Codex P1/P2, shipped in #112)

- **Baseline idle wipe.** The client wipes the in-memory DEK after 15 minutes
  of inactivity (spec §7/§11), returning to the locked view. #113 extends the
  fuller lockout UX (explicit re-unlock prompts, wipe-on-close).
- **Wrapped-key byte-length validation.** Both the enroll RPC and the TS
  validator reject slot material of the wrong size (hkdf_salt 16, wrap_iv 12,
  wrapped_dek 48, prf_salt 32) so a malformed slot can't be persisted and then
  lock the creator out behind the once-per-creator guard.
- **Enrollment precondition (`not_enrolled`).** The upsert RPC refuses to store
  ciphertext for a creator/version with no key slot, so a direct caller can't
  create an unrecoverable note.
- **Super-admin has no component path.** The "Private notes (only you)" section
  renders only when the actor's role is `ministry_admin`.
- **Decryption failure stays locked.** If an existing note can't be decrypted
  after a successful unlock, the editor stays locked rather than risk an
  overwrite.

## 7. Reuse points for #113 / #114

- Read models: `fetchShepherdCarePrivateNoteCiphertextForCreator(client, careProfileId, creatorProfileId)`, `fetchPrivateNoteKeySlotsForCreator(client, creatorProfileId)` in `lib/supabase/read-models.ts` (types `PrivateNoteCiphertext`, `PrivateNoteKeySlot`).
- RPC wrappers: `rpcAdminEnrollPrivateNoteKeys`, `rpcAdminUpsertShepherdCarePrivateNote` in `lib/admin/rpc.ts`.
- Validators: `validateEnrollPrivateNoteKeysPayload`, `validateUpsertShepherdCarePrivateNotePayload` (+ `PrivateNoteKeySlotInput`) in `lib/admin/validation.ts`.
- Actions: `adminEnrollPrivateNoteKeys`, `adminUpsertShepherdCarePrivateNote` in `app/(protected)/admin/shepherd-care/actions.ts`.
- UI: `components/admin/shepherd-care/private-notes-section.tsx` (the `'use client'` crypto component) — #113 extends it with add-passkey / rotate-recovery / idle-wipe.
- Boundary regression test (#114 extends): `lib/admin/__tests__/sc4-private-notes-migration.test.ts`.
