# ADR 0003: Private care note encryption (SC.4)

**Status:** Accepted (design only; build slices #112–#114 pending)
**Date:** 2026-05-29

## Context

SC.4 gives the Ministry Admin (Julian) a pastoral note "readable by him alone."
CONTEXT.md and ADR-0002 fix the requirement as the one deliberate inversion of
the oversight ladder: the note must be unreadable up the ladder, **including by
the Super Admin (Tom)**. Julian's Q1 sharpened this further — unreadable even by
someone with raw database access — and Tom's own stated intent is to *not have
the ability* to read these notes and for that to be **verifiable**.

A creator-scoped RLS table (Tier 1) keeps notes from other app users but leaves
plaintext readable by anyone with database / dashboard / service-role / backup
access. That fails the requirement. So the body must be encrypted with a key the
server never holds — client-side encryption. The parameters chosen here are hard
to change once notes exist (they bind ciphertext, key-wrapping, and recovery
together), which is why they are settled before any build.

## Decision

**Client-side zero-knowledge encryption at the "Auditable E2E + PRF" assurance
target.** Concretely:

1. **Wrapped DEK.** A random 256-bit Data-Encryption-Key per creator encrypts
   every note (AES-256-GCM). The DEK is stored only as ciphertext, *wrapped*
   under a Key-Encryption-Key per unlock method. Adding/removing an unlock
   method re-wraps the DEK — no note is ever re-encrypted.
2. **Unlock = WebAuthn passkey (PRF) + offline recovery code.** The KEK is
   `HKDF-SHA256` over either the authenticator's PRF (`hmac-secret`) output or a
   256-bit recovery code (Crockford Base32 + QR, shown once). Passkey is primary
   and hardware-bound; the recovery code is the mandatory offline backstop and
   the universal fallback on browsers without PRF.
3. **No password KDF (no Argon2id).** Every input secret is already
   high-entropy, so memory-hardness adds nothing; HKDF-SHA256 derives the KEK.
   This keeps the crypto a single **dependency-free** WebCrypto module.
4. **No server-side recovery / escrow / reset.** Losing all unlock methods makes
   the notes cryptographically unrecoverable — accepted and surfaced in the UI.
5. **Auditable, not runtime-prevented.** All crypto lives in one module whose
   source hash is published per release with a verification procedure; runtime
   tampering by the code-serving operator is *detectable*, not blocked.
6. **In-memory key only**, wiped on logout / tab close / 15-min idle.

See `docs/SC_4_PRIVATE_CARE_NOTES_SPEC.md` for the full data model, RLS, RPCs,
and threat model.

## Considered options

- **Tier 1 — creator-scoped RLS, plaintext body.** Rejected: simplest and
  audit-friendly, but a raw-DB / service-role holder (incl. Tom) reads the
  plaintext. Julian explicitly rejected this. Retained only as the **ciphertext
  store + defense-in-depth**, not as the privacy mechanism.
- **At-rest-only E2E (no verifiability commitment).** Rejected as the *target*:
  it delivers the at-rest guarantee but does not address Tom's "verifiable / no
  ability" intent. Its protections are a subset of what we adopted.
- **Independent code anchor (browser extension / content-addressed module).**
  The only option that *prevents* (not merely detects) an active operator from
  touching plaintext at runtime. Rejected as disproportionate for a
  single-tenant pastoral tool: it requires building and maintaining a reviewed
  extension, Julian must install it, it greatly expands #112–#114, and the trust
  root still rests on who publishes extension updates. Revisit only if the
  active-operator threat becomes real.
- **Argon2id KDF (per the original #111 framing).** Rejected: justified only for
  low-entropy human-chosen passphrases. With a hardware PRF output and a
  generated high-entropy recovery code, it adds a WASM/JS dependency and audit
  surface for no security gain. HKDF-SHA256 is correct here.
- **Memorable user passphrase as an unlock method.** Rejected: would reinstate
  Argon2id and a brute-forceable secret. All secrets stay high-entropy.
- **Server-assisted recovery (escrow / admin reset).** Rejected: any recovery
  path the server can drive is a backdoor that voids the "no ability" guarantee.

## Consequences

- The server, and anyone with DB / dashboard / service-role / backup access
  (including Tom), can never read a note at rest. Search, sort, and
  server-side validation of note *content* become impossible; the server handles
  only ciphertext.
- Audit is **presence/lifecycle only** — architecturally enforced, since the
  server never receives plaintext.
- A new dependency-free `lib/crypto/private-notes.ts` becomes a **verifiable
  artifact**: releases publish its source hash plus a "how to verify" doc; SC.4
  PRs must keep all crypto in this module.
- Two new tables (`shepherd_care_private_notes` ciphertext +
  `shepherd_care_note_key_slots` wrapped-DEK), both creator-scoped RLS, writes
  via `super_admin`-excluding `SECURITY DEFINER` RPCs.
- **Build re-sequencing:** encryption requires a DEK, which requires enrollment.
  The #112 tracer bullet must therefore include a minimal enrollment (generate
  DEK, a mandatory recovery slot plus a passkey where PRF is available, write/read
  one note); #113 fleshes out the full lifecycle (second passkey, recovery/
  re-enroll, recovery-code rotation that atomically revokes the old code, lockout
  UX).
- The guarantee's honest boundary (at-rest, not active-runtime; out of scope for
  a compromised device) must stay documented in the spec threat model and
  reflected in product copy — no absolute "only you, ever" claims.

## Invariants preserved (see AGENTS.md)

All writes still flow through narrow `admin_*` `SECURITY DEFINER` RPC wrappers in
`lib/admin/rpc.ts`; `super_admin` is excluded from these RPCs and from the RLS
read policies (the ladder inversion of ADR-0002). No service-role key enters the
runtime. The paired-audit-row discipline holds, now content-free by
construction.
