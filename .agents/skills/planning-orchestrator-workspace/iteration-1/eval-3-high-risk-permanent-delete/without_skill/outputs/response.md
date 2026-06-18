# Decision Memo: "One-click button for admins to permanently delete a person and all their Care Notes"

Before planning _how_, I checked _whether_ — and the request, taken literally, asks for the one thing this codebase was explicitly built to refuse. So this is a decision memo, not an implementation plan: the literal ask should not be built as stated, but there are a few legitimate goals hiding inside it, and you should pick which one you actually want.

I read the relevant code rather than reasoning from the abstract. The key finding is that **this feature already largely exists** — and the specific cascade you're describing was deliberately designed _out_.

---

## The headline

Your request has four load-bearing words, and three of them collide with accepted, machine-checked invariants:

| Your words                                  | What the codebase says today                                                                                                                                                                                                      | Verdict                                         |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| **"admins"** (Ministry Admin)               | Permanent deletion is **Super-Admin-only** (Tom), never Ministry-Admin (Julian). The RPCs are named `super_admin_*` _specifically_ so that `auth_is_admin()` can't reach them.                                                    | ❌ Conflicts                                    |
| **"permanently delete a person"**           | Already exists: the `profile` entity is a registered permanent-deletion target with a tombstone + paired audit row.                                                                                                               | ✅ Already built                                |
| **"and all of their Care Notes"** (cascade) | A profile with **any** Care Note (as subject _or_ author) is made **undeletable** on purpose — reported as an opaque `confidential` block — so an `on delete cascade` can never silently destroy author-private pastoral content. | ❌ Conflicts (by design)                        |
| **"in one click"**                          | An inline one-click Super-Admin Delete control **already exists** (`SuperAdminInlineDelete`), with a quick-confirm popover and a server-side preflight.                                                                           | ✅ Already built (for non-confidential targets) |

So the honest summary is: **you're ~70% asking for something that already ships, and ~30% asking to tear out a safety mechanism that three ADRs exist to protect.** The 30% is the part to talk about before anyone writes code.

---

## Context: what forces this choice

The repo is **archive-only by design**. "Delete" everywhere means soft-delete (`archived_at` / status flags), recoverable, governed by the oversight ladder. Permanent physical deletion is a single, bounded, audited escape hatch documented in **ADR 0014** (`docs/adr/0014-super-admin-permanent-deletion.md`).

That ADR's _first_ rejected option is, almost verbatim, your request:

> **"Literal 'delete any table', with cascade.** Rejected: one click could erase a person plus all their care history…"

And the **2026-06-06 amendment (#388)** to that ADR is the exact safeguard your request would undo: Care Notes and Prayer Requests are sealed-by-default pastoral writing (ADR 0017/0020). Their FKs are `on delete cascade`/`restrict`, so to allow a person-delete to "take their Care Notes with it" you would either (a) let the cascade fire and **silently, unrecoverably destroy** sealed notes the tombstone can't snapshot, or (b) read/enumerate those notes to delete them deliberately — which **breaks the author-private seal** that the whole transparency-toggle model rests on. The migration `20260609000000_phase_sad7_confidential_block_care_notes.sql` chose to make the person **undeletable** rather than accept either.

This is enforced, not just documented:

- `tests/fitness/**` (gating CI) blocks direct table writes, `select("*")`, and service-role keys.
- `super_admin_confidential_block()` short-circuits the preflight _before_ dependents are even counted, returning an opaque "confidential" block.

The relevant files I grounded this in:

- `docs/adr/0014-super-admin-permanent-deletion.md` — the decision + the rejected "cascade" option + the #388 amendment.
- `CONTEXT.md` → "Permanent deletion" / "Tombstone" glossary entries (Super-Admin-only, refuses rather than cascades, never reaches Private Care Notes).
- `lib/admin/permanent-deletion.ts` — the curated registry; `PROFILE` is already a target; `INLINE_DELETABLE_ENTITY_TYPES` already includes `"profile"`.
- `app/(protected)/admin/super-admin/permanent-delete-actions.ts` — `superAdminPermanentDelete` (phrase-gated) and `superAdminInlineDelete` (one-click), both `requireSuperAdminSession`.
- `components/admin/super-admin/inline-delete.tsx` — the existing one-click Delete button + preflight popover.
- `supabase/migrations/20260609000000_phase_sad7_confidential_block_care_notes.sql` — the Care-Note seal.
- `lib/admin/danger-zone.ts` — `PERMANENT_DELETE_CONFIRM_PHRASE = "PERMANENTLY DELETE"`, result/preflight types.

---

## What you most likely actually want (interpretations)

The stated request is a _mechanism_. The underlying goal is probably one of these — and they point at very different work:

- **A. "A person record is genuinely junk (test/dupe/spam) and I want it physically gone, fast."** → Largely already shipped. The gap is only that it's Super-Admin-only and that a person _with_ Care Notes is blocked.
- **B. "A person left / must be erased for privacy (a GDPR-style 'right to be forgotten'), and their Care Notes must go too."** → This is a real, legitimate need that the current design _deliberately doesn't serve_ — and it deserves its own deliberate feature, not a cascade bolted onto the existing button.
- **C. "Julian (Ministry Admin), not just Tom, should be able to do this day-to-day."** → This is the riskiest reading and the one most directly at odds with the role model. Probably _not_ what you want once it's spelled out.
- **D. "I just want a person off my working surfaces and I don't care that the row survives."** → That's **Archive** (soft delete / "deactivate"), which already exists and is the intended path. No new feature needed.

---

## Options

### Option 1 — Do (almost) nothing; point to what exists

Use the **existing** Super-Admin inline Delete on a person. It already gives a one-click (quick-confirm) permanent delete with tombstone + audit. A person with no Care Notes deletes cleanly today.

- **Buys:** zero new risk, zero code. Resolves interpretation **A** and **D** entirely.
- **Costs:** doesn't touch the "and all their Care Notes" cascade or the Ministry-Admin reach. If those are the actual goal, this doesn't satisfy them.

### Option 2 — A purpose-built, Super-Admin "Erase person + pastoral records" flow (the right home for cascade)

Keep it Super-Admin-only, but add a _deliberate, audited, tombstoned_ path that can also remove that person's Care Notes / Prayer Requests — as an explicit, multi-step, type-to-confirm operation that **snapshots each note into a tombstone first** (so it stays recoverable) and writes a paired audit row per the invariant. This is effectively a small new ADR amending 0014, because it reverses the #388 "seal, never erase" posture for a narrow, owner-gated case.

- **Buys:** serves interpretation **B** (privacy erasure) honestly, without a silent cascade and without breaking recoverability.
- **Costs:** real work + a governance decision. It re-opens a sealed-pastoral-content question that ADR 0014/#388 closed on purpose; needs the note bodies to be snapshotted by a `security definer` RPC, which is a new (bounded) read past the author-private seal. **This is a high-blast-radius change and must go through a Review Plan with Security + Database gates before any code.**
- **Not "one click."** The deliberate friction (phrase confirm, preflight showing exactly how many sealed notes will be tombstoned) is the feature, not an obstacle to remove.

### Option 3 — Build the literal request: a one-click button, for Ministry Admins, that cascades a person + their Care Notes

- **Buys:** matches the words you typed.
- **Costs:** violates at least three invariants at once — Super-Admin-only deletion, no broad cascade through care history, author-private seal — and would fail the fitness suite / review. **Recommend rejecting this outright.** It's the exact option ADR 0014 already considered and rejected.

---

## Risks (per option)

- **Opt 1:** none of consequence. Main risk is it simply doesn't meet the goal, surfacing later as "but it's blocked when there are notes."
- **Opt 2:** _medium-high._ Re-introduces a way to destroy sealed pastoral content; must be (a) Super-Admin-only, (b) tombstoned per-note so it's recoverable, (c) audited, (d) impossible for `ministry_admin` to reach. Getting any of those wrong is a P0. The transparency-toggle model means even _reading_ the notes to snapshot them is sensitive.
- **Opt 3:** _severe and immediate._ Silent unrecoverable loss of pastoral notes; privilege escalation of a destructive capability to the wrong role; CI failure. Don't.

## Cost of delay

Low. The benign cases (A, D) are already served today, so nothing is on fire. The privacy case (B) is the only one with real urgency, and rushing it is exactly how you'd breach the seal — so delay favors doing B _carefully_.

---

## Recommendation

1. **Reject the literal request** (Option 3). One click, Ministry-Admin, cascading through Care Notes is the precise thing ADR 0014 + #388 were written to prevent.
2. **Default to Option 1** unless you can name a concrete case that it fails. For "this person record is junk," the capability already exists — it's just Super-Admin-gated and blocked when notes are attached.
3. **If the real driver is privacy erasure (B), pursue Option 2 as a separate, governed effort** — starting with a _Review Plan_, not an implementation plan, because it touches sealed pastoral data and an irreversible action. Its first artifact should be an ADR amendment to 0014.

The single question that decides everything: **which interpretation (A / B / C / D) is the actual goal?** If you can answer that, I can produce the right next artifact — likely "you're done, use the existing control" (A/D) or a Review Plan + ADR-amendment outline (B).

---

## Rejected alternatives (so they aren't re-litigated)

- _Make it Ministry-Admin-callable._ No — the `super_admin_*` naming exists precisely to keep `auth_is_admin()` from reaching permanent deletion. Disable/archive is Julian's lever.
- _Let the FK cascade do the Care-Note cleanup._ No — the tombstone snapshots only set-null dependents, so a cascade is unrecoverable loss; #388 swapped this for an opaque block on purpose.
- _Suppress the note count but allow the delete._ Explicitly considered and rejected in #388 for the same recoverability reason.

---

## Decision criteria — how we'll know we chose right

- No path lets a `ministry_admin` trigger permanent deletion.
- No Care Note / Prayer Request is ever destroyed without a recoverable tombstone + paired audit row.
- The author-private seal and transparency-toggle semantics are unchanged for every non-deletion read path.
- `npm run test:run` (fitness suite) stays green.

---

### If you confirm Option 2, the next session should start from a Review Plan, not code. Suggested handoff seed:

> Produce a **Review Plan** (Security + Database gates) and an **ADR amendment to 0014** for a Super-Admin-only "Erase person and their pastoral records" operation. Hard constraints: Super-Admin-only (`super_admin_*` RPC, `requireSuperAdminSession`, no `auth_is_admin()` path); every removed Care Note / Prayer Request is snapshotted into a tombstone before deletion (recoverable); paired `audit_events` row per the same-transaction invariant; type-to-confirm phrase (no "one click"); preflight discloses exactly how many sealed notes will be tombstoned before the operator commits; `auth.users` never touched; Super-Admin profiles never targetable. Ground it in `docs/adr/0014-super-admin-permanent-deletion.md`, `lib/admin/permanent-deletion.ts`, `app/(protected)/admin/super-admin/permanent-delete-actions.ts`, and `supabase/migrations/20260609000000_phase_sad7_confidential_block_care_notes.sql`. Do not implement until the Security/Database gates pass.
