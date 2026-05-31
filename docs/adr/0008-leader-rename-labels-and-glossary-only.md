# "Shepherd" → "Leader" rename: labels and glossary only

There is no standalone "Shepherd" tier — only Leaders and the Over-Shepherds who
oversee them (CONTEXT.md). We correct the vocabulary in user-facing labels and in
the glossary, but **deliberately do not** rename the database (`shepherd_care_*`
tables/columns/enums) or the code identifiers (`lib/admin/shepherd-care-*`,
routes like `/admin/shepherd-care`).

## Why

The user-facing word was wrong and confusing; that is cheap to fix and worth
fixing before launch. Renaming the DB and code is a heavy, risky migration
touching RLS, `SECURITY DEFINER` RPCs, audit-event action strings, and routes —
no functional payoff, real regression risk, right before launch.

## The deviation to be aware of

A future reader will see "Leader care" in the UI but `shepherd_care_*` in the
database and `shepherd-care` in routes/filenames. This mismatch is **intentional**
— do not "fix" it by renaming the schema. "Over-Shepherd" is retained as a single
atomic term and is unaffected.

## Consequences

- UI labels and CONTEXT.md read "Leader" / "Leader care"; the DB and code keep
  the `shepherd_care_*` / `shepherd-care` names.
- If a full rename is ever wanted, it becomes its own migration ADR — not folded
  into label work.
