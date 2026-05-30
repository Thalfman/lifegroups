# Life Group Operations

Julian's admin operating system for shepherding Life Group leaders and
planning group launches. The app is currently for the ministry's
oversight tiers only — not for group leaders themselves.

## Language

### People & roles

**Shepherd**:
A person who leads a Life Group. Julian's word for what the codebase calls
a `leader` (and `co_leader` → Co-Life Shepherd). Shepherds are the people
the ministry cares for. They have a deliberately minimal, **maintenance-mode**
surface — they log in only to submit weekly check-ins (the source of the
Health Pulse) and view their group calendar. The app is built for the
oversight tiers; no new leader-facing features ship without Julian's explicit
go-ahead (LDR.1).
_Avoid_: Leader, group leader (these are the code-level identifiers only).

**Over-Shepherd**:
A coach responsible for a set of Shepherds. Sits above Shepherds and below
the Ministry Admin in the oversight ladder. Tracked today as coverage data;
becoming a login tier.
_Avoid_: Coach, over shepherd, overseer.

**Ministry Admin**:
The ministry leader who runs the operating system day to day (Julian). Sees
everything an Over-Shepherd sees, plus more.
_Avoid_: Admin (ambiguous), pastor.

**Super Admin**:
The platform owner (Tom). Top of the oversight ladder; sees everything a
Ministry Admin sees, plus platform/account administration.
_Avoid_: Owner, root, developer.

### The oversight ladder

The roles form a strict visibility ladder — each tier sees what the tier
below sees, and more:

**Super Admin ▸ Ministry Admin ▸ Over-Shepherd ▸ Shepherd**

The Shepherd tier has only a minimal **maintenance-mode** surface (weekly
check-ins + group calendar); it is not the headline product and is frozen to
new features without Julian's go-ahead (LDR.1). The one deliberate exception
to "higher tiers see everything below" is private care notes — see CONTEXT
note on Private Care Note below.

### Care concepts

**Private Care Note**:
A pastoral note a Ministry Admin records for their eyes only. Deliberately
escapes the oversight ladder: not visible to other tiers — and, by intent,
not to the Super Admin either.
_Avoid_: Encrypted note, secret note.

### Health concepts

Three different "health" ideas live in the system and are easy to conflate.
They answer different questions about different subjects.

**Group-Health Grade**:
A computed grade of how a Life *Group itself* is doing (Q12) — Julian's
"grade them" concept. Distinct from how the group's Shepherd is doing.
_Avoid_: Health score, group status, group health (when you mean the grade).

**Leader Care Status**:
How a *Shepherd* is doing from the Ministry Admin's pastoral view — an
"is there an issue, and what's the next step" signal on the person, not the
group.
_Avoid_: Leader health, care category, group health.

**Health Pulse**:
A *Shepherd's own* self-reported weekly sentiment about their group. A
subjective leader-entered input — not the computed Group-Health Grade.
_Avoid_: Group health, health status (when you mean the grade).
