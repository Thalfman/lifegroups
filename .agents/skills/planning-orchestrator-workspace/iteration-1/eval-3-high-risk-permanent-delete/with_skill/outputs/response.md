# Planning: "One-click permanently delete a person and all their Care Notes"

**Type of artifact:** Decision memo + high-risk review plan (not an implementation plan — yet).

**Bottom line up front:** This request, taken literally, asks the app to do the one thing its permanent-deletion system was deliberately built to _refuse_. The codebase already has a complete, audited Super-Admin permanent-deletion feature (ADR 0014). In that ADR, "one click could erase a person plus all their care history" is written down verbatim as a **considered-and-rejected** option. So before planning _how_ to build a button, we need a decision on _whether_ the underlying goal justifies overturning an accepted architectural boundary — and, if it does, that's a schema + ADR change, not a UI button.

I am not refusing the work. I'm flagging that the cheap-looking version of it is blocked by design, and routing you to the real decision.

---

## 1. The request, pulled apart

|                                 |                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stated request**              | A button that lets admins, in one click, permanently delete a person and all of that person's Care Notes.                                                                                                                                                                                                                                                                                               |
| **Underlying goal (inferred)**  | An operator needs a fast way to make a person _and their pastoral history_ truly disappear — most likely for a data-cleanup, off-boarding, or privacy/"right to be forgotten" reason. The "one click" framing signals they find the current path too slow or too obstructed.                                                                                                                            |
| **Key assumptions baked in**    | (a) Cascade-deleting Care Notes alongside the person is acceptable; (b) "admins" should be able to do this — but the existing model reserves permanent deletion for the **Super Admin** only; (c) "person" = a single, unambiguous record type; (d) one-click (low-friction) is appropriate for an irreversible, high-blast-radius action. **Every one of these collides with a documented invariant.** |
| **Missing context**             | _Why_ permanent (vs. archive)? Who is the "admin" (Ministry Admin or Super Admin)? Which "person" — a `member` (non-auth pastoral record) or a `profile` (a Leader/Over-Shepherd login)? Which "Care Notes" — there are **three distinct note systems** in this repo, and they behave very differently.                                                                                                 |
| **Alternative interpretations** | See §3 — at least four readings, pointing at materially different work.                                                                                                                                                                                                                                                                                                                                 |

---

## 2. The hard collision (read this before scoping anything)

The repo is **archive-only by design**, with a single, bounded escape hatch for permanent deletion. Three load-bearing rules sit directly in this request's path:

1. **CLAUDE.md security invariant:** "No hard deletes in normal workflows. Archive is the default... Permanent deletion is Super-Admin-only, writes a tombstone, and lives in the danger zone." A one-click admin button is, almost word for word, the anti-pattern this invariant forbids.

2. **ADR 0014 (Accepted, 2026-06-03) — `docs/adr/0014-super-admin-permanent-deletion.md`** built the permanent-delete engine and deliberately made it _refuse cascades_:
   - `super_admin_permanent_delete(p_entity_type, p_id)` (in `supabase/migrations/20260604030000_phase_sad3_permanent_deletion_profiles.sql`) **refuses to delete any record that has cascade/restrict/no-action dependents** — it raises `has_blocking_dependents` and reports them so the operator clears them first. _No silent cascade through care history_ is the explicit promise.
   - ADR 0014 "Considered options" lists **"Literal 'delete any table', with cascade. Rejected: one click could erase a person plus all their care history."** That is this request.

3. **ADR 0014 amendment (#388) + ADRs 0002/0003 — Care Notes are an _opaque permanent blocker_.** `super_admin_confidential_block(...)` (same migration, lines 178–202; extended in `20260609000000_phase_sad7_confidential_block_care_notes.sql`) makes any person who is the **subject or author** of a `care_notes` / `prayer_requests` row, or who holds an SC.4 private note, **impossible to permanently delete** — the engine raises `has_confidential_records` and reports it opaquely ("disable instead"). There is no hard-delete RPC for these notes _by design_ ("seal and disable, never erase").

**Net effect:** today, a person _with Care Notes_ is exactly the case the engine is guaranteed to reject. Building "delete the person AND their Care Notes in one click" means **un-building the two safeguards ADR 0014 was created to provide** — the cascade refusal and the confidential block. That is an ADR-reversing decision, not a feature.

---

## 3. "Person" and "Care Notes" are both ambiguous — and it changes everything

The research surfaced that these words map to several different things in this codebase. The plan can't proceed until these are pinned down, because the work differs wildly.

**"Person" is one of two records:**

- **`members`** (`supabase/migrations/20260517040000_phase2_schema.sql`) — non-auth pastoral records. Soft-delete via a `status` enum (`active/inactive/paused/transferred`); **no `archived_at`**. Already registered as a deletable entity (`'member' -> members`).
- **`profiles`** — actual logins (Leader / Over-Shepherd / Ministry Admin). Permanent-delete touches **only the `public.profiles` row, never `auth.users`** (no-service-role-key invariant). Disable/re-enable is the normal lever.

**"Care Notes" is one of _three_ systems:**

| System                                                      | Table                                              | Subject                                                                                         | Privacy posture                                                              |
| ----------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Author-private Care Notes / Prayer Requests (ADR 0017/0020) | `care_notes`, `prayer_requests`                    | **a `profile`** (`subject_profile_id`, ON DELETE **CASCADE**; author FK ON DELETE **RESTRICT**) | Sealed to author unless transparency toggle on; **opaque permanent blocker** |
| SC.4 encrypted private notes (ADR 0002/0003)                | `shepherd_care_private_notes`                      | a care profile of a `profile`                                                                   | Zero-knowledge, escapes Super Admin entirely; **opaque permanent blocker**   |
| Member care system                                          | `member_care_profiles`, `member_care_interactions` | **a `member`** (`member_id` ON DELETE **RESTRICT**)                                             | Admin-only; blocks member deletion today                                     |

This is the trap in the request. **Care Notes (the `care_notes` table) attach to `profiles`, not `members`.** Member-care _interactions_ attach to `members`. So "a person and all their Care Notes" describes two different entities depending on which "person" is meant — and if it means a `profile` with `care_notes`, that target is _exactly_ the opaque-blocked case.

**The FK graph an unbounded cascade would hit** (research-confirmed):

- Deleting a `member`: `group_memberships` (CASCADE), `attendance_records` (CASCADE), `follow_ups.related_member_id` (SET NULL), `leader_pipeline.member_id` (SET NULL), `member_care_profiles.member_id` (**RESTRICT** → blocks today).
- Deleting a `profile`: `care_notes.subject_profile_id` (CASCADE) and author FK (RESTRICT), `prayer_requests` (CASCADE), `note_transparency_grants` (CASCADE), plus the confidential block short-circuits it.

A naive "one-click cascade" would silently erase group memberships, attendance, and pastoral content with **no tombstone for the cascaded children** (the tombstone snapshots only set-null dependents, per ADR 0014) — i.e. unrecoverable loss, against the recoverability promise.

---

## 4. Challenge — is this the right thing to build?

The strongest alternative to "build the button" is **"don't, and ask what problem it solves."** Walking the plausible goals:

- **If the goal is privacy / right-to-be-forgotten:** the right design is a _scoped, audited, recoverable_ erasure with a tombstone, likely a new ADR amendment — **not** a one-click cascade. The existing engine is 90% of the machinery; the gap is a deliberate policy choice (confidential block), and that choice should be changed _as a decision_, not bypassed in a button.
- **If the goal is routine cleanup / de-duplication:** the intended path already exists — **archive** the member (set `status`), and the person leaves every surface, reversibly. No new feature needed. The friction the user feels may be discoverability of archive, not a missing delete.
- **If the goal is "an admin shouldn't have to ask the Super Admin":** that's a _role-boundary_ request. ADR 0014 makes permanent deletion Super-Admin-only on purpose (`super_admin_*` gate, not `admin_*`, precisely so Ministry Admins can't reach it). Widening it to "admins" is a security-posture change requiring its own decision.
- **If the goal really is "physically erase a person and their care history in one motion":** that is the ADR-0014-rejected option, and it needs an **ADR amendment** that consciously accepts erasing pastoral content. That is a Julian/Tom (Ministry-Admin/Super-Admin) policy call, not an engineering default.

In **every** branch, the next correct step is a decision, and in most branches the answer is "use archive / the existing bounded delete," not "build a new cascading button."

---

## 5. Domains selected (and excluded)

**Selected:**

1. **Security / authorization** — touches the deletion role boundary, the no-service-role-key rule, and RLS on confidential notes. This is the dominant lens.
2. **Database** — FK delete-action graph, tombstone snapshotting, the cascade-vs-block policy encoded in the schema.
3. **Product / domain** — "permanent vs archive," "member vs profile," "which Care Notes" are product decisions with documented vocabulary (CONTEXT.md).
4. **Compliance / privacy** — Care Notes' sealed-by-default posture (ADR 0002/0003/0017/0020); any erasure of pastoral content is a privacy decision.
5. **UX (risk-framing)** — irreversible action UX (type-to-confirm, preflight, no "one click").
6. **Testing** — destructive paths need the reads-seam unit-test treatment plus fitness-suite checks.

**Excluded:**

- **DevOps / infra** — no deployment or infra change implied.
- **Performance** — single-record operation; not a hot path.
- **Frontend visual design** — the danger-zone UI primitives already exist (`danger-zone-card-shell.tsx`, `inline-delete.tsx`); no new design language is needed.

---

## 6. Decision memo — three viable paths

### Path A — "Use what exists." Don't build a new button. (Recommended default)

Permanent deletion of a `member` _without_ care records already works via the Super-Admin danger zone (`super_admin_permanent_delete`, entity `member`). For members _with_ care history, the intended path is **archive** (reversible) or **clear the member-care records first, then delete** (the engine reports the blocker). For `profiles` with Care Notes, the intended path is **disable**, by explicit ADR 0014 decision.

- **Cost:** ~none. Possibly a small UX/discoverability improvement so operators find archive.
- **Risk:** none — stays inside every invariant.
- **When this is right:** the goal is cleanup/off-boarding and "permanent + cascade" was an over-specification.

### Path B — "Convenience wrapper, still bounded." A guided multi-step Super-Admin flow.

A new Super-Admin-only flow that, for a chosen person, _first_ clears the operator-clearable dependents (e.g. member-care interactions/profile, archived memberships) **each as its own audited RPC + tombstone**, _then_ calls the existing `super_admin_permanent_delete`. It is "fewer clicks," but it is **not** a silent cascade — each step is audited, recoverable, and still blocked by the confidential block if true Care Notes (`care_notes`/SC.4) exist.

- **Cost:** medium. New orchestration, new RPC(s), preflight extension, danger-zone UI, tests.
- **Risk:** medium. Stays within ADR 0014's spirit but adds a sequenced destructive workflow; must keep the confidential block intact and never reach `care_notes`/`prayer_requests` content.
- **When this is right:** the goal is "too many manual steps to permanently remove a member," and Care Notes here means _member-care records_, not the sealed `care_notes` table.

### Path C — "Reverse the boundary." Allow cascading deletion of a person _and_ their sealed Care Notes.

This is the literal request. It requires: a **new ADR (amending 0014)** consciously accepting erasure of pastoral content; a **new hard-delete RPC for `care_notes`/`prayer_requests`/SC.4** (none exists today, deliberately); **removing or narrowing `super_admin_confidential_block`**; deciding whether tombstones must snapshot the cascaded notes (recoverability) or whether erasure is the point; and a **role-boundary decision** if "admins" is to include Ministry Admins.

- **Cost:** high. Schema + RLS + multiple RPCs + ADR + extensive tests + fitness-suite implications.
- **Risk:** **very high.** Directly overturns ADRs 0002/0003/0014; breaks the "Care Notes are readable by Julian alone / sealed to author" promise; irreversible if tombstones are omitted. This needs **Julian (Ministry Admin) and Tom (Super Admin) sign-off**, not an engineering decision.
- **When this is right:** only if there's a genuine legal/privacy mandate to _erase_ (not seal) pastoral content — in which case Path C should be _scoped to that mandate_, recoverable where law allows, and explicitly decided.

**Recommendation:** Start at **Path A**, confirm the goal. Only move to **B** if the goal is member-record cleanup with too much friction. Treat **C** as a governance decision that must go through an ADR before any code — never as a default-on button.

---

## 7. Open questions (answering these picks the path)

Only three, each materially changing the plan:

1. **Why permanent rather than archive?** (Cleanup → Path A; privacy/legal erasure → Path C; "too many steps" → Path B.)
2. **Which "person" and which "Care Notes"?** A `member` + member-care records (Path B-eligible), or a `profile` + the sealed `care_notes` table (Path C territory, currently blocked by design)?
3. **Who is "admins"?** If this must be available to **Ministry Admins**, that alone is a role-boundary change requiring a decision, independent of the delete mechanics.

(Assumption to flag if wrong: I'm reading "one click" as "the current path feels too slow," not as a hard requirement that the action be genuinely single-click and unconfirmed. An unconfirmed one-click irreversible delete is itself an anti-pattern this repo's danger-zone UX rejects — type-to-confirm + preflight is the house style.)

---

## 8. If a path is chosen — the review plan (gates, regardless of A/B/C)

Because this is high-blast-radius (irreversible, identity + sensitive pastoral data), any implementation must pass these gates:

1. **ADR gate (Path C mandatory; Path B if it changes deletion semantics):** a written ADR amendment to 0014, sign-off from Ministry Admin + Super Admin, before code.
2. **Role-boundary gate:** confirm the RPC is `super_admin_*`-gated (`auth_role() = 'super_admin'`), not `admin_*` — unless §7-Q3 explicitly widens it via decision. Fitness suite enforces no hardcoded identity; gate on `profiles.role`.
3. **Audit gate:** every destructive RPC writes a paired `audit_events` row _in the same transaction_ (CLAUDE.md invariant). Confirm actor-descriptor denormalization still holds for deleted actors.
4. **Recoverability gate:** define explicitly whether deleted Care Notes are tombstoned (recoverable) or truly erased. If erased, that must be the _named, accepted_ point of the ADR — not an accident of cascade.
5. **Confidential-boundary gate:** if Path B, prove the flow never reads or deletes `care_notes` / `prayer_requests` / SC.4 content and the opaque block stays intact. If Path C, the ADR must consciously remove it.
6. **No-service-role-key gate:** deletion stays a `SECURITY DEFINER` RPC; `auth.users` untouched (`profile` row only).
7. **UX gate:** type-to-confirm phrase + preflight (mirror `permanent-delete-card.tsx` / `inline-delete.tsx`), never an unconfirmed one-click on an irreversible action.
8. **Testing gate:** reads-seam unit tests for the new action (auth-denied / validation / guard / blocker / confidential-block / success branches, mirroring `lib/admin/__tests__/run-action.test.ts`); fitness suite stays green (no `select("*")`, no direct table writes, run-action routing).

---

## Final handoff prompt (for a future session, once the path is chosen)

> **Context:** We are deciding how (and whether) to let an operator permanently delete a person and their Care Notes in the `lifegroups` repo. The repo is archive-only by design; permanent deletion already exists as a _bounded Super-Admin escape hatch_ (ADR 0014, `docs/adr/0014-super-admin-permanent-deletion.md`) that **deliberately refuses cascade deletes and opaquely blocks any record holding Care Notes** (`super_admin_confidential_block` in `supabase/migrations/20260604030000_phase_sad3_permanent_deletion_profiles.sql`, extended in `20260609000000_phase_sad7_confidential_block_care_notes.sql`). "Delete a person plus all their care history in one click" is the explicitly _rejected_ option in ADR 0014. The literal request therefore needs an ADR-level decision before any code.
>
> **Before implementing, the user must answer three questions:** (1) why permanent vs. archive; (2) which "person" — a `member` (table `members`, has `member_care_profiles`/`member_care_interactions`, `member_id` FKs are RESTRICT) or a `profile` (logins; `care_notes.subject_profile_id` CASCADE, author FK RESTRICT, plus SC.4 sealed notes); (3) whether "admins" includes Ministry Admins (a role-boundary change — current gate is `super_admin_*` only).
>
> **Three paths exist** (see decision memo): **A** — use existing archive / bounded delete, no new feature (recommended default); **B** — a guided, _still-audited, still-recoverable_ Super-Admin flow that clears operator-clearable member-care dependents (each its own RPC + tombstone + audit) then calls the existing `super_admin_permanent_delete`, never touching the sealed `care_notes` table; **C** — reverse the ADR 0014 boundary to cascade-erase a person and their sealed Care Notes (requires a new ADR amendment, Ministry-Admin + Super-Admin sign-off, a new hard-delete RPC for notes that doesn't exist today, and removal of the confidential block — **very high risk**).
>
> **If building Path B (the likely buildable one):** mirror the existing pipeline exactly — validate → guard → RPC → revalidate → log via `runAdminWriteAction` (`lib/admin/run-action.ts`), `requireSuperAdminSession` (`lib/auth/session.ts`), typed wrapper via `adminRpc` (`lib/admin/rpc.ts`), action wired in `app/(protected)/admin/super-admin/permanent-delete-actions.ts`, validators in `lib/admin/validation/`, UI in the danger zone (`components/admin/permanent-delete-card.tsx`, `components/admin/super-admin/inline-delete.tsx`, `components/admin/danger-zone-card-shell.tsx`) with type-to-confirm + preflight. Each new destructive RPC is `SECURITY DEFINER`, gated on `auth_role() = 'super_admin'`, writes a tombstone + paired `audit_events` row in the same transaction, and never touches `auth.users`, `care_notes`, `prayer_requests`, or SC.4 notes. Keep the confidential block intact.
>
> **Acceptance criteria:** the chosen path's review gates (§8) all pass; fitness suite green (`npm run test:run`); new reads-seam unit tests cover auth-denied / validation / guard / blocker / confidential-block / success branches; no `select("*")`, no direct table writes, no service-role key, no hardcoded identity.
>
> **Non-goals / guardrails:** do not add an unconfirmed one-click irreversible delete; do not widen permanent deletion to `admin_*` without an explicit decision; do not erase Care Notes without an accepted ADR amendment; do not touch `auth.users`.
