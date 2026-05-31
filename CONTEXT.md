# Life Group Operations

Julian's admin operating system for shepherding Life Group leaders and
planning group launches. The app is currently for the ministry's
oversight tiers only — not for group leaders themselves.

## Language

### People & roles

**Leader**:
A person who leads a Life Group (the `leader` role; `co_leader` → Co-Leader).
Leaders are the people the ministry cares for. They have a deliberately minimal,
**maintenance-mode** surface — they log in only to submit weekly check-ins (the
source of the Health Pulse) and view their group calendar. The app is built for
the oversight tiers; no new Leader-facing features ship without Julian's explicit
go-ahead (LDR.1).
_Avoid_: Shepherd (there is no "Shepherd" tier — only Leaders and the
Over-Shepherds who oversee them), group leader.

**Over-Shepherd**:
A coach responsible for a set of Leaders. Sits above Leaders and below
the Ministry Admin in the oversight ladder. Tracked today as coverage data;
becoming a login tier. Kept as a single atomic term even though there is no
standalone "Shepherd".
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

**Super Admin ▸ Ministry Admin ▸ Over-Shepherd ▸ Leader**

The Leader tier has only a minimal **maintenance-mode** surface (weekly
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
"grade them" concept. Distinct from how the group's Leader is doing.
_Avoid_: Health score, group status, group health (when you mean the grade).

**Leader Care Status**:
How a *Leader* is doing from the Ministry Admin's pastoral view — an
"is there an issue, and what's the next step" signal on the person, not the
group.
_Avoid_: Leader health, care category, group health.

**Health Pulse**:
A *Leader's own* self-reported weekly sentiment about their group. A
subjective leader-entered input — not the computed Group-Health Grade.
_Avoid_: Group health, health status (when you mean the grade).

### Surfaces

**Home Hub**:
The authenticated landing surface a user sees on sign-in, before entering the
admin OS. Adapts to the viewer's tier (Super / Ministry Admin see the admin-OS
launcher; Over-Shepherd sees a focused one) and shows navigation tiles plus
at-a-glance live stats. Replaces the old straight-to-`/admin` redirect.
_Avoid_: Dashboard (ambiguous with the admin metrics surface), home page.

**Settings**:
The Ministry-Admin configuration surface — ministry/pastoral knobs (thresholds,
care cadence, group-health weights) and the Julian-owned pastoral copy
(group-health question wording + care-status labels; see ADR 0007). Visible to
Ministry Admin and Super Admin.
_Avoid_: Admin settings, config (ambiguous with the Super Admin Console).

**Super Admin Console**:
The platform/app configuration surface — feature flags, user & access
management, and platform-level editable copy. Super Admin only; the Ministry
Admin never sees it. Julian-owned pastoral copy (the group-health questions and
care-status labels) is **not** edited here — it stays in Settings so Julian keeps
ownership of his own wording (ADR 0007, PRD Q2).
_Avoid_: Settings (that is the ministry surface), admin panel.
