# Concept Reconciliation — retiring the lingering original concept

> 🧹 **This is a backlog/audit, not a build spec.** It inventories where the app's
> **original concept** (a broad, Leader-inclusive group-operations platform) still lingers
> in code, schema, and copy after the pivot to **Julian's admin operating system** (see
> [`../PRD.md`](../PRD.md) → _What this is NOT_). Each item has a suggested **disposition**;
> none is actioned here. The intent is to give a future session one place to work from, so
> the old concept stops blending with the new one and surprising readers.
>
> Vocabulary follows [`../../CONTEXT.md`](../../CONTEXT.md). Decisions that already justify a
> "keep" live in the ADRs cited inline.

_Disposition legend:_
🟢 **keep** (intentional, decided) ·
✏️ **rename / copy fix** (mechanical) ·
🗑️ **remove** (dead / deprecated) ·
🧊 **keep frozen, mark explicitly** (needs a Julian/Tom call) ·
🔀 **in-flight** (already ticketed)

---

## A — Half-finished Shepherd→Leader copy renames ✅ RESOLVED

> ✅ **Resolved (V1 / #194).** All six strings below were corrected in commit
> `78fea60` ("Finish Shepherd→Leader copy renames (6 stale strings)"). A
> codebase grep confirms no user-facing string still uses "coach" or "My
> Shepherds"/"This Shepherd" where the glossary says Leader / Over-Shepherd; the
> remaining matches are code identifiers and test fixtures, kept per section D /
> ADR 0008. The worklist table is retained below for history.

ADR 0008 renamed the _user-facing_ labels from "Shepherd" to "Leader" but a few strings were
missed. These contradict the glossary, which lists **"Coach"** as an _Avoid_ term for
Over-Shepherd and reserves "Shepherd" as non-existent as a standalone tier.

| Artifact               | Location                                                               | Current copy                                            | Suggested                       |
| ---------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------- |
| "coach" in empty state | `components/admin/shepherd-care/coverage-by-over-shepherd-card.tsx:48` | "Add a coach to start tracking coverage."               | "Add an over-shepherd…"         |
| "coach" in create form | `components/admin/shepherd-care/over-shepherd-create-form.tsx:32`      | "Add a coach or over-shepherd…"                         | "Add an over-shepherd…"         |
| "Coaches" in lede      | `app/(protected)/admin/shepherd-care/over-shepherds/page.tsx:67`       | "Coaches and over-shepherds Julian tracks."             | "Over-Shepherds Julian tracks." |
| stale back-link        | `app/(protected)/over-shepherd/[profileId]/page.tsx:95`                | "← My Shepherds" (page title already says "My Leaders") | "← My Leaders"                  |
| stale fallback name    | `app/(protected)/over-shepherd/[profileId]/page.tsx:69`                | "This Shepherd"                                         | "This Leader"                   |
| stale empty-state      | `app/(protected)/over-shepherd/[profileId]/page.tsx:137`               | "Care touches with this Shepherd will appear here."     | "…with this Leader…"            |

**Disposition:** ✅ done — landed as mechanical copy fixes in `78fea60` (#194). No
user-facing string remains in violation of `CONTEXT.md`.

## B — Deprecated `staff_viewer` role still present 🗑️ / 🧊

`staff_viewer` is retained in the role enum/union for back-compat and is treated as
no-access (never assignable from the UI). It is a remnant of the original multi-tier vision
and clutters the role system for new readers.

- `types/enums.ts` — still in the `UserRole` union.
- `lib/auth/roles.ts` — labelled "Legacy (no access)"; predicates carry it.
- `lib/admin/validation.ts` — rejects `staff_viewer` on role changes.
- `app/(protected)/admin/super-admin/actions.ts` — guards against assignment.
- `components/admin/super-admin-console-shell.tsx` — surfaces "Legacy staff_viewer rows" counts.

**Disposition:** 🗑️/🧊 needs a call — either remove the enum value (and migrate any rows) or
explicitly quarantine it (e.g. an "archived roles" grouping) so it reads as dead, not live.

## C — Frozen / dormant surfaces still reachable by URL 🧊

These surfaces are dropped from nav but still resolve behind `requireAdmin()` / role gates.
They are gated correctly but carry no visible "frozen" signal, so they can be re-discovered
or accidentally re-exposed.

- `app/(protected)/leader/*` — the Leader maintenance-mode surface (LDR.1; ADR 0002).
- `app/(protected)/admin/guests/page.tsx` — guest pipeline, deferred under EXT.1.
- `app/(protected)/admin/check-ins/page.tsx` — Admin check-in review, demoted from nav.

**Disposition:** 🧊 keep frozen per LDR.1 / EXT.1, but mark explicitly. ADR 0009 already
establishes that runtime flags may re-enable frozen surfaces — consider routing these through
that mechanism (a feature flag default-off) rather than leaving them silently live. Decision
for Julian/Tom: gate-and-mark vs. leave as-is.

## D — Intentional code ↔ label mismatch (ADR 0008) 🟢

The database keeps `shepherd_care_*` tables/enums (`shepherd_care_profiles`,
`shepherd_care_interactions`, `shepherd_care_follow_ups`, `shepherd_care_private_notes`,
`shepherd_coverage_assignments`, …) and the routes keep `shepherd-care` / `over-shepherd`
paths, while the UI reads "Leader care" / "My Leaders".

**Disposition:** 🟢 **keep — decided.** ADR 0008 deliberately scoped the rename to labels and
glossary only; renaming the schema is explicitly _not_ wanted (migration risk). Recorded here
only so it stops being re-discovered as a surprise. **Do not "fix" the schema.**

## E — Leader Care Status vocabulary mismatch 🔀

Shipped enum is `healthy / watch / needs_attention`; Julian adopted five values verbatim —
`doing_well / needs_encouragement / needs_follow_up / concern / inactive` (ADR 0004 / D2).

**Disposition:** 🔀 in-flight — the backfill/migration is already tracked in **#122**. No new
decision; just not yet landed.

## F — Disconnected Job-2 surfaces / no Leader pipeline 🔀

Capacity, forecast, and multiplication all ship but as disconnected surfaces, and there is no
real Leader pipeline (apprentices → readiness stages) tying capacity to staffing.

**Disposition:** 🔀 in-flight — the integrated re-frame is specced in
[`CAPACITY_AND_MULTIPLICATION_PRD.md`](./CAPACITY_AND_MULTIPLICATION_PRD.md) (Q9–Q11). Job 2 is
functionally built but **not** "done"; that plan is the live spec.

---

## How to use this

Each row is owner-actionable in a future session:

- **✅ (A)** — done; the mechanical copy fixes landed in `78fea60` (#194).
- **🔀 (E, F)** — already ticketed; track in their issues/plans, nothing new owed.
- **🟢 (D)** — no action; documented so it reads as decided, not accidental.
- **🗑️ / 🧊 (B, C)** — need a Julian/Tom decision before code changes (remove vs. quarantine;
  gate-and-mark vs. leave).

When an item is resolved, strike it here and, if it changes intent, fold the outcome into
[`../PRD.md`](../PRD.md) and the relevant ADR.
