# SC.4 — Private Care Notes — Spec

**Status:** 🆕 Specced, not built. **Decision made (2026-05-29): Tier 2 —
zero-knowledge encryption** (see [§2](#2-the-decision-for-julian-q1)). The
detailed crypto design + threat model is tracked in **issue #111**
(`ready-for-human`); build slices are #112–#114, blocked until #111 lands.
Sections 3–9 below describe the Tier-1 RLS fenced-table, which remains the
**storage substrate and defense-in-depth** — but the note body is stored as
**ciphertext**, encrypted/decrypted client-side per #111, not as plaintext.

**Source of record:** Julian's Q8
([`julian-inputs/`](./julian-inputs/README.md)) and the intent recorded in
[`CONTEXT.md`](../CONTEXT.md) ("Private Care Note"). Tracked in
[`MASTER_BLUEPRINT.md`](./MASTER_BLUEPRINT.md) as **SC.4** and as blocker **Q1**.

---

## 1. Purpose

Give the Ministry Admin (Julian) a place to record a pastoral note about a
shepherd **readable by him alone** — a tier *above* the already-shipped
admin-only care model, where even a second `ministry_admin` and the
`super_admin` cannot read it through the app.

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

> **Resolved 2026-05-29 — Tier 2 (zero-knowledge encryption).** Julian wants the
> notes unreadable by *everyone* but him, including the platform owner with raw
> database access. A second factor that the server can send (TOTP / SMS / email
> code) was ruled out: it is an access gate, not secrecy — anyone with DB/server
> access bypasses it. The chosen mechanism is **client-side encryption with a key
> the server never holds** (a generated high-entropy unlock code → Argon2id →
> AES-256-GCM; passkey/WebAuthn-PRF unlock is a possible follow-on). Accepted
> consequences: **lost key = permanently unrecoverable notes**, and the server
> cannot audit content or search/sort these notes. The exact crypto parameters,
> recovery model, and threat model are settled in **issue #111** before any build.

The original framing is kept below for context. "Only you" had two defensible
interpretations; Tier 2 was chosen.

### Tier 1 — "only you, inside the app" — creator-scoped RLS *(recommended, build now)*

Private notes live in their own fenced table. Row-Level Security grants SELECT
only when the caller is the note's creator
(`created_by_profile_id = auth_profile_id()`). This excludes other
`ministry_admin`s **and** `super_admin` from reading the note through the app and
through PostgREST.

- **Pros:** simple, queryable, audit-friendly, consistent with every other care
  surface; no key management; reuses the existing RPC/audit/read-model machinery.
- **Honest caveat:** a project owner with **raw database access** (Supabase
  dashboard, direct SQL, or the service-role key) could still read the
  plaintext. "Only you" here means "only you among app users," not "only you,
  even against Tom-with-DB-access."

### Tier 2 — "only you, period" — application-layer encryption *(deferred)*

Store ciphertext that is unreadable without a key Julian controls.

- True "only Julian" requires **client-side** encryption with a key derived from
  Julian's passphrase and **never sent to the server** — otherwise anyone with
  server/runtime access (still Tom) can decrypt.
- **Cost:** breaks `SECURITY DEFINER` server-side writes, server-side
  search/sort/filter on those notes, and password-reset recoverability of past
  notes (lose the passphrase → lose the notes). Audit can only ever record
  presence.
- **Recommendation:** do not build now. Revisit only if Julian explicitly says
  the notes must be unreadable even to the platform owner.

**Chosen path:** **Tier 2** (see the resolution box above). Tier 1 alone left the
notes readable by a raw-DB holder, which Julian explicitly rejected. Tier 1's
fenced table + creator-scoped RLS are still built — as the ciphertext store and
defense-in-depth — but the body is encrypted client-side.

### Precedent that makes Tier 1 the natural shape

The repo already solved the adjacent problem in **OS.5**
(`supabase/migrations/20260529004000_phase_os5_fence_admin_summary.sql`): it
moved `admin_summary` out of `shepherd_care_profiles` into a separate fenced
table `shepherd_care_admin_notes`, on the explicit rationale that

> RLS is row-level only; cannot withhold single columns … an app-layer column
> allowlist is NOT a database fence.

SC.4 is the same pattern, one notch stricter: a fenced table whose RLS is
**creator-scoped** rather than merely **admin-scoped**.

---

## 3. Data model (Tier 1)

A new fenced table, one private note per `(care profile, creating admin)`:

```sql
create table public.shepherd_care_private_notes (
  id                    uuid primary key default gen_random_uuid(),
  care_profile_id       uuid not null references public.shepherd_care_profiles(id) on delete cascade,
  created_by_profile_id uuid not null references public.profiles(id),
  body                  text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- One private note per (shepherd care profile, owning admin).
create unique index shepherd_care_private_notes_profile_creator_uniq
  on public.shepherd_care_private_notes (care_profile_id, created_by_profile_id);
```

**Why a separate table, not a `private_body` / `visibility` column on
`shepherd_care_interactions` or `_profiles`:** RLS cannot withhold a single
column from a tier that has row access (the OS.5 lesson). A column on a table
that `super_admin` can SELECT would leak via PostgREST regardless of any
app-layer allowlist. A dedicated table lets the privacy boundary be a *table*
RLS policy — the only enforceable fence.

**Why `(care_profile_id, created_by_profile_id)` rather than one row per
profile:** the boundary is per-creator. Julian is the only `ministry_admin`
today, but modeling it per-creator means a future second admin's notes are
private to *them*, not silently shared — and it keeps the RLS predicate
(`created_by = me`) and the unique key aligned.

## 4. RLS

```sql
alter table public.shepherd_care_private_notes enable row level security;

-- SELECT: only the creating admin. Excludes other ministry_admins AND
-- super_admin. auth_is_admin() kept as defense-in-depth so a future non-admin
-- never matches even if a row's creator id were somehow theirs.
create policy shepherd_care_private_notes_creator_select
  on public.shepherd_care_private_notes
  for select to authenticated
  using (
    public.auth_is_admin()
    and created_by_profile_id = public.auth_profile_id()
  );

-- No INSERT / UPDATE / DELETE policies: writes flow exclusively through the
-- SECURITY DEFINER RPC below.
grant select on public.shepherd_care_private_notes to authenticated;
```

Reused helpers (`supabase/migrations/20260518000000_phase4_rls.sql:17-53`):

- `public.auth_is_admin()` → `super_admin` or `ministry_admin` (the strict gate;
  **never** `auth_is_admin_or_staff()`).
- `public.auth_profile_id()` → the caller's active profile id, from `auth.uid()`.

**Why the read path actually enforces this:** the read model uses the
RLS-bound cookie client (`createSupabaseServerClient`), so this policy fires on
every read. `SECURITY DEFINER` RPCs bypass RLS by design, which is why writes go
through the RPC (it sets the creator itself) and reads go through the policy.

## 5. RPC (write path)

```
admin_upsert_shepherd_care_private_note(
  p_care_profile_id uuid,
  p_body            text,
  p_set_body        boolean      -- tri-state: only writes body when true
) returns uuid                   -- the private-note id
```

`SECURITY DEFINER`, following `admin_upsert_shepherd_care_profile`
(`20260518160000_phase5d0_…`) and the OS.5 recreated RPC:

1. **Auth gate:** `v_actor := public.auth_profile_id();` then require
   `public.auth_is_admin()` and `v_actor is not null`, else
   `raise exception 'insufficient_privilege'`.
2. **Creator is the actor:** `created_by_profile_id := v_actor` — never a
   client-supplied id. This is what makes the note un-spoofable.
3. **Target validation:** the care profile's shepherd must be an active
   `leader` / `co_leader`, else `missing_care_profile` / `missing_profile`
   (same checks as the existing care RPCs).
4. **Upsert** on the `(care_profile_id, created_by_profile_id)` unique key, with
   the tri-state `p_set_body` flag so callers can update other fields later
   without clobbering the body.
5. **Audit** a paired `audit_events` row in the same transaction, action
   `admin.shepherd_care.upsert_private_note`, **presence only**
   (`has_body := p_body is not null`) — **never the body text**, matching every
   existing care RPC.

## 6. Read model

In `lib/supabase/read-models.ts`, mirroring the `admin_summary` re-attach
pattern (~lines 766–982):

```ts
const SHEPHERD_CARE_PRIVATE_NOTE_COLUMNS =
  "id, care_profile_id, created_by_profile_id, body, created_at, updated_at";

// Called ONLY behind requireAdmin(); RLS additionally guarantees a caller
// can only ever read their own note. Explicit allowlist — never select("*").
export async function fetchShepherdCarePrivateNoteForCreator(
  careProfileId: string,
  creatorProfileId: string,
): Promise<ReadResult<PrivateNote | null>> { /* …select(COLUMNS)… */ }
```

- Returns the `ReadResult<T>` shape used across the module.
- Filters on both `care_profile_id` and `created_by_profile_id` (belt-and-braces
  with RLS).
- **No** leader / co_leader / over_shepherd / staff_viewer reader is added.

## 7. RPC wrapper + server action

- `lib/admin/rpc.ts`: `rpcAdminUpsertShepherdCarePrivateNote(client, args)`
  delegating to `callUuidRpc(client, "admin_upsert_shepherd_care_private_note",
  args)` — same one-liner shape as the other care wrappers.
- `app/(protected)/admin/shepherd-care/actions.ts`: a `runAdminWriteAction`
  spec named `admin.shepherd_care.upsert_private_note` with a pure validator,
  `okFields: { body_set }`, and `revalidate: shepherdCarePaths(profileId)`.
  Auth, logging, audit, and revalidation come for free from the runner
  (`lib/admin/run-action.ts:119-195`).

## 8. UI

On `app/(protected)/admin/shepherd-care/[profileId]/page.tsx`, add a
**"Private notes (only you)"** section after the admin-summary card. It fetches
*only the current admin's own* note via
`fetchShepherdCarePrivateNoteForCreator(careProfileId, session.profile.id)` and
renders an add/edit form. Copy states the boundary plainly, e.g.: *"Visible only
to you — not to other admins or the platform owner in the app."* (Carry the
Tier-1 raw-DB caveat in the spec/PR, not necessarily in product copy.)

## 9. Privacy invariants / non-goals

- Never exposed to `leader` / `co_leader` / `over_shepherd` / `staff_viewer` —
  no route, read model, or component path.
- Excluded from every SC.2 / SC.3 aggregate, attention-queue feed, or summary
  that another admin can see.
- Excluded from any future EXT.1 / comms surface unless re-specced with its own
  privacy review.
- No exports, no public API, no AI summarization of these notes.
- Audit metadata carries **presence only**, never the body.
- **Tier-1 caveat (must remain documented):** plaintext is readable by a holder
  of raw DB / service-role access. If that is unacceptable, escalate to Tier 2.

## 10. Test plan (for the build PR, not this spec)

- **Unit:** the payload validator (required `care_profile_id`, body length
  bounds, tri-state `set_body` semantics).
- **RLS / integration:** prove the boundary —
  (a) the creating admin reads their note;
  (b) a *second* `ministry_admin` reading the same `care_profile_id` gets no row;
  (c) `super_admin` gets no row;
  (d) `leader` / `over_shepherd` get no row.
- **Audit:** assert an `audit_events` row is written and that
  `metadata` contains `has_body` but **no** body text.
- Place tests beside the existing care tests
  (`lib/admin/__tests__/`, `lib/auth/__tests__/`).

## 11. Resolved (blueprint Q1)

**Tier 2 (zero-knowledge encryption) chosen** — see §2. The remaining detail
work (exact KDF/cipher params, key mechanism incl. optional passkey/PRF, recovery
model, threat model) is tracked in **issue #111** and must be signed off before
the build slices (#112–#114) start.

## 12. Reference code (reused by the build)

- OS.5 fenced-table precedent — `supabase/migrations/20260529004000_phase_os5_fence_admin_summary.sql`
- Care foundation + deferral comment — `supabase/migrations/20260518160000_phase5d0_shepherd_care_foundation.sql`
- SQL role helpers — `supabase/migrations/20260518000000_phase4_rls.sql:17-53`
- Care RPC + audit pattern — `admin_upsert_shepherd_care_profile`, `admin_log_shepherd_care_interaction`
- Read models + `admin_summary` re-attach — `lib/supabase/read-models.ts` (~766–982)
- Action runner — `lib/admin/run-action.ts:119-195`; care actions — `app/(protected)/admin/shepherd-care/actions.ts`
- Detail UI attach point — `app/(protected)/admin/shepherd-care/[profileId]/page.tsx`
