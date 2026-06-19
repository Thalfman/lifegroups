# Rename the user-facing "Leader" label back to "Shepherd"

Reverses the **user-facing** half of [ADR 0008](./0008-leader-rename-labels-and-glossary-only.md).
Front-facing copy now reads **Shepherd** (was "Leader") and **Co-Shepherd** (was
"Co-Leader"). **Over-Shepherd** is unchanged. This is a **labels-only** change:
the code and database identity stays `leader` / `co_leader`.

## Why

The ministry's own vocabulary settled on "Shepherd" for the people who lead a
Life Group. ADR 0008 had moved the labels the other way ("Shepherd" → "Leader")
to match the role enum value; that call is now reversed for the user-facing copy.
Because the schema already speaks "shepherd" in several places (`shepherd_care_*`
tables, the `over_shepherd` role, `/admin/shepherd-care` routes), showing
"Shepherd" in the UI actually **re-aligns** the visible vocabulary with the
existing data model rather than introducing new drift.

## What changes

- **User-facing copy only:** role labels (`ROLE_LABELS` in `lib/auth/roles.ts`),
  section headings, descriptions, form options, dashboard card titles, nav labels
  ("My Shepherds"), validation/error messages, audit-log display strings, and
  content-bearing aria-labels. `Leader` → `Shepherd`, `Co-Leader` → `Co-Shepherd`.

## What deliberately does NOT change

Same spirit as ADR 0008 — renaming the schema/code is heavy and risky with no
functional payoff:

- The `user_role` / `role_in_group` enum **values** `leader` / `co_leader`.
- The `leader_*` / `admin_*_leader_*` `SECURITY DEFINER` RPCs and `auth_is_leader_of`.
- TypeScript types (`UserRole`, `RoleInGroup`, `LeaderReadinessStage`,
  `LeaderHealthLetter`), guards (`requireLeader`, `isLeaderRole`), and the
  `leader_surface` feature-flag key.
- Routes / URLs (`/leader`, `/admin/leader-pipeline`, `/admin/shepherd-care`) and
  filenames (`leader-profile-form.tsx`, …).
- Audit-event `action` keys (e.g. `leader.update_follow_up_status`) — only their
  human-readable display strings change.
- **Over-Shepherd** stays a single atomic term.

## The deviation to be aware of

A future reader sees "Shepherd" in the UI but `leader` / `co_leader` in the
database, RPCs, routes, and types. This mismatch is **intentional** — do not
"fix" it by renaming the schema. (It is the mirror image of the mismatch ADR 0008
created; the People-import CSV still accepts the literal value `leader`.)

## Consequences

- `CONTEXT.md`, `CLAUDE.md`, `README.md`, and `okf/glossary/index.md` now teach
  **Shepherd** / **Co-Shepherd** as the user-facing terms while flagging that the
  code identity stays `leader` / `co_leader`. The former "_Avoid_: Shepherd" rule
  is withdrawn for UI copy.
- If a full code/DB rename is ever wanted, it remains its own migration ADR — not
  folded into label work.
