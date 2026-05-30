# SC.4 — Private Care Notes — Spec

**Status:** 🆕 Specced, not built. **Decision made (2026-05-29): Tier 2 —
zero-knowledge encryption, "Auditable E2E + PRF" assurance target** (see
[§2](#2-the-decision-for-julian-q1)). The crypto design + threat model
(issue #111) is now **settled**; build slices are #112–#114.

The note body is stored as **ciphertext only**, encrypted and decrypted
**client-side**. The server — and anyone with database, dashboard,
service-role, or backup access, **including the platform owner (Tom)** — never
holds the plaintext, the key, the recovery code, or the WebAuthn PRF output.
The Tier-1 fenced table + creator-scoped RLS from earlier drafts remain, as the
**ciphertext store and defense-in-depth**, not as the privacy mechanism.

**Source of record:** Julian's Q8
([`julian-inputs/`](../julian-inputs/README.md)) and the intent recorded in
[`CONTEXT.md`](../../CONTEXT.md) ("Private Care Note"). Tracked in
[`MASTER_BLUEPRINT.md`](./MASTER_BLUEPRINT.md) as **SC.4** and as blocker **Q1**.
The foundational crypto decisions are recorded in
[`docs/adr/0003-private-care-note-encryption.md`](../adr/0003-private-care-note-encryption.md).

---

## 1. Purpose

Give the Ministry Admin (Julian) a place to record a pastoral note about a
shepherd **readable by him alone** — a tier *above* the already-shipped
admin-only care model, where even a second `ministry_admin` and the
`super_admin` cannot read it, **and where the platform owner cannot read it from
the database either**.

Julian's Q8, verbatim: notes "that should only be readable by you" — *"Yes,
that would be helpful."* CONTEXT.md states the intent precisely:

> **Private Care Note** — A pastoral note a Ministry Admin records for their eyes
> only. Deliberately escapes the oversight ladder: not visible to other tiers —
> and, by intent, not to the Super Admin either.

This was anticipated and deferred by the care foundation migration:

> "Encrypted private notes are documented as deferred. If Julian asks for
> complete privacy on specific notes later, that's a follow-up slice."
> — `supabase/migrations/20260518160000_phase5d0_shepherd_care_foundation.sql:30-31`

The trigger (Q8) is now met.

## 2. The decision for Julian (Q1)

> **Resolved 2026-05-29 — Tier 2 (zero-knowledge encryption), assurance target
> "Auditable E2E + PRF".** Julian wants the notes unreadable by *everyone* but
> him, including the platform owner with raw database access. The mechanism is
> **client-side encryption with a key the server never holds**: a per-creator
> Data-Encryption-Key (DEK) is generated in the browser, every note is encrypted
> under it with AES-256-GCM, and the DEK itself is stored only as ciphertext,
> *wrapped* under keys derived from a **WebAuthn passkey (PRF extension)** and an
> offline **recovery code**. Accepted consequences: **lost all unlock methods =
> permanently unrecoverable notes**, the server cannot audit content or
> search/sort these notes, and the privacy guarantee is **at-rest** (see §2.1).

### 2.1 The assurance target and its honest boundary

The chosen target is **"Auditable E2E + PRF"** (see ADR-0003 for the rejected
alternatives). What it does and does not promise:

- **Protects against (passive / at-rest):** anyone reading the database
  directly — raw SQL, the Supabase dashboard, the service-role key, or database
  backups — sees ciphertext only. This **includes the platform owner (Tom)**:
  there is no server-side key and no escrow, so Tom cannot decrypt a note at
  rest. It also excludes every other app role (other `ministry_admin`,
  `super_admin`, `over_shepherd`, `leader`, `staff_viewer`) via both the absence
  of a key and creator-scoped RLS.
- **Does NOT prevent (active / runtime):** because the app's JavaScript is
  served from the platform owner's origin, an *actively malicious* operator
  could in principle ship a modified build that captures Julian's plaintext or
  unwrapped key at the moment he decrypts in-session. No browser-delivered E2E
  crypto can prevent the party that ships the code from shipping bad code.
- **The mitigation we commit to instead:** make any such tampering
  **detectable**. All cryptographic operations live in one dependency-free
  module; each release publishes that module's source hash with a "how to
  verify" procedure (optionally pinned with Subresource Integrity). Runtime
  tampering is therefore *auditable, not blocked* — a deliberate, accepted
  residual (see §11 threat model).
- **Out of scope:** a compromised browser/extension/keylogger on Julian's own
  device while a note is decrypted in-session.

A fully *prevented* runtime guarantee was considered (move the crypto into an
independently-published browser extension Tom cannot silently change) and
rejected as disproportionate for a single-tenant pastoral tool — see ADR-0003.

### Precedent that makes the fenced table the natural substrate

The repo already solved the adjacent problem in **OS.5**
(`supabase/migrations/20260529004000_phase_os5_fence_admin_summary.sql`): it
moved `admin_summary` out of `shepherd_care_profiles` into a separate fenced
table `shepherd_care_admin_notes`, on the explicit rationale that

> RLS is row-level only; cannot withhold single columns … an app-layer column
> allowlist is NOT a database fence.

SC.4 uses the same pattern, one notch stricter: a fenced table whose RLS is
**creator-scoped** rather than merely **admin-scoped** — and whose body column
is ciphertext, so the fence is belt-and-braces over the encryption.

---

## 3. Data model

Two tables. One holds per-note ciphertext; the other holds the per-creator
key material (the wrapped DEK, one row per unlock method).

```sql
-- Per-note ciphertext. No plaintext column exists.
create table public.shepherd_care_private_notes (
  id                    uuid primary key default gen_random_uuid(),
  care_profile_id       uuid not null references public.shepherd_care_profiles(id) on delete cascade,
  created_by_profile_id uuid not null references public.profiles(id),
  ciphertext            bytea not null,                 -- AES-256-GCM output (ct || 128-bit tag)
  iv                    bytea not null,                 -- 12-byte (96-bit) random nonce
  dek_version           smallint not null default 1,    -- which DEK generation encrypted this row
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index shepherd_care_private_notes_profile_creator_uniq
  on public.shepherd_care_private_notes (care_profile_id, created_by_profile_id);

-- Per-creator key material: the DEK, wrapped once per unlock method ("slot").
create table public.shepherd_care_note_key_slots (
  id                    uuid primary key default gen_random_uuid(),
  created_by_profile_id uuid not null references public.profiles(id),
  dek_version           smallint not null default 1,
  slot_type             text not null check (slot_type in ('passkey','recovery')),
  credential_id         bytea,                          -- WebAuthn credential id (passkey slots); null for recovery
  label                 text,                           -- e.g. "Windows Hello (laptop)", "Recovery code"
  prf_salt              bytea,                          -- WebAuthn PRF eval input (passkey slots); null for recovery
  hkdf_salt             bytea not null,                 -- 16-byte salt for HKDF-SHA256 → KEK
  wrapped_dek           bytea not null,                 -- DEK encrypted under the KEK (AES-256-GCM, ct || tag)
  wrap_iv               bytea not null,                 -- 12-byte nonce for the wrap
  created_at            timestamptz not null default now()
);

create index shepherd_care_note_key_slots_creator_idx
  on public.shepherd_care_note_key_slots (created_by_profile_id);

-- At most ONE recovery slot per creator per DEK generation, so rotating the
-- recovery code replaces (never accumulates) it. Passkey slots are unconstrained.
create unique index shepherd_care_note_key_slots_one_recovery_uniq
  on public.shepherd_care_note_key_slots (created_by_profile_id, dek_version)
  where slot_type = 'recovery';
```

**Why two tables.** Note ciphertext and key material have different lifecycles:
a note is written/edited often; the wrapped DEK changes only on
enrollment, passkey add/remove, or recovery-code rotation. Splitting them keeps
the per-note row minimal and lets "add an unlock method" be a single-row insert
that never touches note rows (no re-encryption).

**Why no plaintext, no salt, no KDF params on the note row.** The body never
exists server-side. The IV is per-encryption. The AAD
(`care_profile_id` + `created_by_profile_id` + `dek_version`) is reconstructed at
decrypt time from columns already present, and is fully known to the client
*before* the first insert — it deliberately excludes the DB-generated note `id`,
which does not exist yet when a brand-new note is encrypted. All KDF salts live
on the key slot, with the secret they stretch.

**Why `(care_profile_id, created_by_profile_id)` is unique.** The boundary is
per-creator. Julian is the only `ministry_admin` today, but modeling it
per-creator means a future second admin's notes are private to *them*, and it
keeps the RLS predicate (`created_by = me`) aligned with the unique key.

## 4. RLS

Both tables are creator-scoped. The wrapped DEK is useless without Julian's
secret, but RLS still fences it as defense-in-depth (and to avoid leaking
device-label / slot metadata to other admins).

```sql
alter table public.shepherd_care_private_notes   enable row level security;
alter table public.shepherd_care_note_key_slots  enable row level security;

-- SELECT: only the creating Ministry Admin. Gated on the ministry_admin role
-- specifically (NOT auth_is_admin(), which also admits super_admin) AND the
-- creator match. Excludes other admins AND super_admin, per CONTEXT.md ("not to
-- the Super Admin either") and docs/adr/0002 (private notes are the one upward
-- inversion in the oversight ladder).
create policy shepherd_care_private_notes_creator_select
  on public.shepherd_care_private_notes
  for select to authenticated
  using (
    public.auth_role() = 'ministry_admin'
    and created_by_profile_id = public.auth_profile_id()
  );

create policy shepherd_care_note_key_slots_creator_select
  on public.shepherd_care_note_key_slots
  for select to authenticated
  using (
    public.auth_role() = 'ministry_admin'
    and created_by_profile_id = public.auth_profile_id()
  );

-- No INSERT / UPDATE / DELETE policies on either table: writes flow exclusively
-- through the SECURITY DEFINER RPCs in §5.
grant select on public.shepherd_care_private_notes  to authenticated;
grant select on public.shepherd_care_note_key_slots to authenticated;
```

Reused helpers (`supabase/migrations/20260518000000_phase4_rls.sql:17-53`):

- `public.auth_role()` → caller's active role. SC.4 gates on
  `auth_role() = 'ministry_admin'` — deliberately **narrower** than
  `auth_is_admin()` (which also admits `super_admin`).
- `public.auth_profile_id()` → caller's active profile id, from `auth.uid()`.

**EXECUTE lockdown (match the existing care RPC migrations).** For every
`SECURITY DEFINER` function in §5: `revoke all … from public, anon,
authenticated;` then `grant execute … to authenticated;` so the privileged
functions are never callable by `public` / `anon`.

**Why the read path enforces this:** the read model uses the RLS-bound cookie
client (`createSupabaseServerClient`), so these policies fire on every read.
`SECURITY DEFINER` RPCs bypass RLS by design, which is why writes go through the
RPCs (they set the creator themselves) and reads go through the policies.

## 5. RPCs (write path)

All `SECURITY DEFINER`, following `admin_upsert_shepherd_care_profile`
(`20260518160000_phase5d0_…`) and the OS.5 recreated RPC. Every one:
**(a)** sets `v_actor := public.auth_profile_id()` then requires
`public.auth_role() = 'ministry_admin'` and `v_actor is not null`, else
`raise exception 'insufficient_privilege'` — **`super_admin` is intentionally
not admitted**; **(b)** derives `created_by_profile_id` from `v_actor`, never
from a client argument; **(c)** writes a paired `audit_events` row in the same
transaction with **presence/lifecycle metadata only**.

```
-- Initial enrollment: create the first key slots. A recovery slot is MANDATORY
-- (the offline backstop / universal fallback when PRF is unavailable); passkey
-- slots are optional but expected wherever PRF is available. The RPC rejects a
-- slot set that contains no recovery slot.
admin_enroll_private_note_keys(p_dek_version smallint, p_slots jsonb) returns void

-- Add a passkey slot (re-wrap the SAME DEK; no note re-encryption). Recovery
-- slots are NOT added here — use admin_rotate_private_note_recovery; the partial
-- unique index in §3 also blocks a second recovery slot.
admin_add_private_note_key_slot(
  p_slot_type text, p_credential_id bytea, p_label text,
  p_prf_salt bytea, p_hkdf_salt bytea, p_wrapped_dek bytea, p_wrap_iv bytea
) returns uuid

-- Rotate the recovery code: in ONE transaction, delete the existing recovery
-- slot and insert the replacement. The old recovery code MUST stop unlocking the
-- instant the new one is issued — a rotated-out code that stays valid would
-- defeat the very mitigation (lost/stolen device) rotation exists for.
admin_rotate_private_note_recovery(
  p_hkdf_salt bytea, p_wrapped_dek bytea, p_wrap_iv bytea, p_label text
) returns uuid

-- Remove a passkey slot (cannot remove the last remaining slot).
admin_remove_private_note_key_slot(p_slot_id uuid) returns void

-- Upsert a note's ciphertext on the (care_profile_id, created_by_profile_id) key.
admin_upsert_shepherd_care_private_note(
  p_care_profile_id uuid,
  p_ciphertext      bytea,
  p_iv              bytea,
  p_dek_version     smallint,
  p_set_body        boolean   -- tri-state: only writes ciphertext/iv when true
) returns uuid                -- the private-note id
```

Notes on the note-upsert RPC specifically:

1. **Target validation:** the care profile's shepherd must be an active
   `leader` / `co_leader`, else `missing_care_profile` / `missing_profile`
   (same checks as the existing care RPCs).
2. **Upsert** on the `(care_profile_id, created_by_profile_id)` unique key, with
   the tri-state `p_set_body` flag so callers can touch other fields later
   without clobbering the ciphertext.
3. **Audit** action `admin.shepherd_care.upsert_private_note`, **presence only**.
   The server only ever has ciphertext, so it *cannot* record content even in
   principle. Record `after.has_body := <stored ciphertext> is not null` (derived
   from the persisted row, not the argument) and `body_set := p_set_body`.
4. **No `dek_version` rewrite across notes.** The RPC stores the
   `dek_version` the client used. Slots and notes share one DEK generation today
   (`dek_version = 1`); the column exists so a future key rotation can introduce
   `dek_version = 2` without a destructive migration.

Key-lifecycle RPCs audit `admin.shepherd_care.private_note.{enroll,add_slot,
remove_slot,rotate_recovery}` — presence/labels only, **never** `wrapped_dek`,
`prf_salt`, `hkdf_salt`, the recovery code, or the DEK.

## 6. Client crypto module (the verifiable surface)

All cryptography lives in **one dependency-free module**,
`lib/crypto/private-notes.ts`, built only on WebCrypto (`crypto.subtle`) plus a
tiny Crockford-Base32 codec. This is the surface whose source hash is published
per release (§2.1). It has **no transitive dependencies** and never imports
app/server code.

Surface (exact bytes fixed in the build PR; parameters fixed here):

- `generateDek(): CryptoKey` — `crypto.getRandomValues`, 256-bit AES-GCM key.
- `deriveKekFromPrf(prfOutput: ArrayBuffer, hkdfSalt): CryptoKey` — HKDF-SHA256.
- `deriveKekFromRecoveryCode(code: string, hkdfSalt): CryptoKey` — decode
  Crockford → HKDF-SHA256.
- `wrapDek(dek, kek, aad): {wrapped, iv}` / `unwrapDek(wrapped, iv, kek, aad)` —
  AES-256-GCM.
- `encryptNote(dek, plaintext, aad): {ciphertext, iv}` /
  `decryptNote(dek, ciphertext, iv, aad)` — AES-256-GCM; `aad` =
  `care_profile_id` + `created_by_profile_id` + `dek_version` (all known to the
  client before the first insert; deliberately NOT the DB-generated note `id`,
  which is unavailable when a brand-new note is encrypted).
- `generateRecoveryCode(): string` — 256-bit → Crockford Base32, grouped.
- WebAuthn helpers: register a passkey via `navigator.credentials.create` with
  the `prf` extension; evaluate PRF at unlock via `navigator.credentials.get`
  with `allowCredentials` set to the stored credential and
  `extensions.prf.evalByCredential` keyed by that credential id
  (`{ "<base64url credentialId>": { first: prf_salt } }`). Use `evalByCredential`,
  not the creation-time `eval` shape — `eval` does not reliably return PRF output
  during authentication once more than one passkey can exist. The 32-byte result
  feeds `deriveKekFromPrf`.

**Cipher parameters (fixed):** AES-256-GCM, fresh 12-byte random IV per
encryption, 128-bit tag, AAD bound to row context. **KEK derivation (fixed):**
HKDF-SHA256, 16-byte per-slot salt, fixed app `info` label. **No Argon2id / no
password KDF** — every input secret is already high-entropy (32-byte PRF output
or 256-bit recovery code), so memory-hardness adds nothing; HKDF derives a
uniform KEK. This keeps the verifiable surface dependency-free (ADR-0003).

## 7. In-session key handling

- After unlock (PRF or recovery code), the **unwrapped DEK lives in memory
  only** — a module-scoped `CryptoKey` / React context. It is **never** written
  to `localStorage`, `sessionStorage`, `IndexedDB`, or any cookie.
- Wiped on logout, on tab/page close, and after **15 minutes of inactivity**
  (timer reset by activity on the care surface), after which Julian must
  re-unlock. `CryptoKey` is created `extractable: false` where the flow allows.

## 8. Read model

In `lib/supabase/read-models.ts`, mirroring the `admin_summary` re-attach
pattern (~lines 766–982):

```ts
// Both called ONLY behind requireAdmin(); RLS additionally guarantees a caller
// can only read their own rows. Explicit allowlist — never select("*").
fetchShepherdCarePrivateNoteCiphertextForCreator(careProfileId, creatorProfileId)
  : ReadResult<PrivateNoteCiphertext | null>     // ciphertext, iv, dek_version, timestamps
fetchPrivateNoteKeySlotsForCreator(creatorProfileId)
  : ReadResult<PrivateNoteKeySlot[]>             // slot_type, credential_id, label, salts, wrapped_dek, wrap_iv
```

- Returns the `ReadResult<T>` shape used across the module.
- Filters on `created_by_profile_id` (belt-and-braces with RLS).
- **No** leader / co_leader / over_shepherd / staff_viewer / super_admin reader.

## 9. RPC wrappers, server actions, UI

- `lib/admin/rpc.ts`: one-line `callUuidRpc` / `callVoidRpc` wrappers per RPC in
  §5, same shape as the other care wrappers.
- `app/(protected)/admin/shepherd-care/actions.ts`: `runAdminWriteAction` specs
  (ADR-0001). The note-upsert spec carries `shepherd_profile_id` in its payload
  and revalidates `shepherdCarePaths(v.shepherd_profile_id)` — **not** the
  care-profile id (the detail route is keyed on the *shepherd* `profiles.id`).
  Auth/logging/audit/revalidation come from the runner
  (`lib/admin/run-action.ts:119-195`). Because the action receives ciphertext,
  its validators check field presence/lengths, never content.
- UI on `app/(protected)/admin/shepherd-care/[profileId]/page.tsx`: a **"Private
  notes (only you)"** section after the admin-summary card. It fetches only the
  current admin's own ciphertext + key slots, prompts for unlock when the DEK is
  not in memory, and encrypts on save / decrypts on view client-side. Copy must
  match the at-rest boundary in §2.1/§11 — it states *where* the note cannot be
  read, not an absolute claim, e.g.: *"Encrypted on your device before it's saved.
  No one else — not other admins, and not the platform owner — can read it from
  the database or backups."* Do **not** word it as unreadable at runtime: an
  actively modified client is out of scope per §2.1. Enrollment surfaces the
  recovery code once (QR + grouped text) and requires an explicit
  **"I've saved my recovery code — I understand a lost code means these notes
  can never be recovered"** acknowledgement before proceeding.

## 10. Privacy invariants / non-goals

- Never exposed to `leader` / `co_leader` / `over_shepherd` / `staff_viewer` /
  `super_admin` — no route, read model, or component path.
- Excluded from every SC.2 / SC.3 aggregate, attention-queue feed, or summary
  any other role can see.
- Excluded from any future EXT.1 / comms surface unless re-specced with its own
  privacy review.
- No exports, no public API, no AI summarization of these notes.
- Audit metadata carries **presence/lifecycle only**, never the body, key
  material, or recovery code — enforced by the server never holding plaintext.
- No server-side recovery, escrow, or key reset. Lost all unlock methods = the
  notes are cryptographically unrecoverable. This is a feature, not a gap.

## 11. Threat model

| Adversary / scenario | Outcome |
| --- | --- |
| Other `ministry_admin` reads via app/PostgREST | **Blocked** — RLS denies the row; no key even if a row leaked |
| `super_admin` reads via app | **Blocked** — RLS excludes super_admin; no key |
| `over_shepherd` / `leader` / `staff_viewer` | **Blocked** — no read path, no key |
| Platform owner: raw SQL / dashboard / service-role / backups | **Blocked at rest** — ciphertext only; no server-side key or escrow |
| Platform owner: actively ships a backdoored client build | **Detectable, not prevented** — published per-release hash + isolated module + verify procedure (§2.1); accepted residual |
| Compromised browser/extension/keylogger on Julian's device, in-session | **Out of scope** — plaintext is necessarily present after Julian decrypts |
| Walk-up attacker on Julian's unlocked machine | **Mitigated** — 15-min idle wipe forces re-unlock (§7) |
| Julian loses every unlock method | **Notes unrecoverable by design** — no backdoor exists |
| Lost/stolen passkey device (still has recovery code) | **Recoverable** — recovery code unwraps the DEK; revoke the lost slot |

## 12. Test plan (for the build PRs, not this spec)

- **Unit (crypto module):** DEK wrap/unwrap round-trip; note encrypt/decrypt
  round-trip; recovery-code derive → unwrap; Crockford encode/decode incl.
  ambiguous-character normalization; AAD mismatch must fail decryption.
- **Unit (validators):** ciphertext/iv presence, length bounds, tri-state
  `set_body`.
- **RLS / integration — the boundary:**
  (a) creating admin reads their own ciphertext row + slots;
  (b) a *second* `ministry_admin` reading the same `care_profile_id` gets no row;
  (c) `super_admin` gets no row; (d) `leader` / `over_shepherd` get no row;
  (e) key-slot table is equally fenced.
- **Audit:** an `audit_events` row is written and `metadata` contains `has_body`
  but **no** body text and **no** key material.
- **No-plaintext assertion:** a direct table read returns only ciphertext/iv —
  scan the row for the known plaintext and assert absence.
- Place tests beside the existing care tests (`lib/admin/__tests__/`,
  `lib/auth/__tests__/`) and the new `lib/crypto/__tests__/`.

## 13. Reference code (reused by the build)

- Foundational crypto decisions — `docs/adr/0003-private-care-note-encryption.md`
- OS.5 fenced-table precedent — `supabase/migrations/20260529004000_phase_os5_fence_admin_summary.sql`
- Care foundation + deferral comment — `supabase/migrations/20260518160000_phase5d0_shepherd_care_foundation.sql`
- SQL role helpers — `supabase/migrations/20260518000000_phase4_rls.sql:17-53`
- Care RPC + audit pattern — `admin_upsert_shepherd_care_profile`, `admin_log_shepherd_care_interaction`
- Read models + `admin_summary` re-attach — `lib/supabase/read-models.ts` (~766–982)
- Action runner (ADR-0001) — `lib/admin/run-action.ts:119-195`; care actions — `app/(protected)/admin/shepherd-care/actions.ts`
- Detail UI attach point — `app/(protected)/admin/shepherd-care/[profileId]/page.tsx`
