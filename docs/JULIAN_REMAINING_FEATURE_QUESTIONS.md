# Questions for Julian — the last calls before launch

A plain-language decision sheet. **Just pick one option per question** (write
in your own if none fit). Every option is something the app can actually do —
no fantasy choices. The tags tell you how much work each is, not to steer you:

- ✅ **Ready today** — already built or a one-line setting change.
- 🔨 **Quick to add** — a small build, days not weeks.
- 🏗️ **Bigger build** — a real feature; worth it if it's worth it.

**How to read this:** Section A is the short list standing between us and
launch — your answers here let us finish. Section B is parked for after launch;
nothing there is holding us up, it's listed so you know it's not forgotten.

> Source of these questions: the open items in
> [`julian-inputs/FEEDBACK_MAP.md`](./julian-inputs/FEEDBACK_MAP.md) §5 and
> [`GROUP_HEALTH_RUBRIC_DISCOVERY.md`](./GROUP_HEALTH_RUBRIC_DISCOVERY.md),
> rewritten for a non-technical read and split by what's launch-gating vs.
> post-launch (see "Already handled" at the bottom for what's done).

---

## A. Decide now — the last things before launch

### A1. Grading group health — what should count?

This is the one piece you said you were still designing. The app already knows
**how consistently each group attends** (we can grade on that today). It does
**not** yet have anywhere to record **"spiritual growth"** — that'd be a new
thing a leader types in.

- **A.** Attendance consistency only — data's already there. 🔨
- **B.** Attendance **plus** the leaders' existing weekly "pulse" check-in
  (already collected), no new fields. 🔨
- **C.** Attendance **plus** a simple "spiritual growth" rating (1–5) leaders
  enter monthly — a new thing for leaders to fill in. 🏗️
- **D.** Hold the grade for now; keep today's Healthy / Watch / Needs-attention
  pulse. ✅

**Your pick:** ___

### A2. What should a group's health look like on screen?

- **A.** A status word — like today's *Healthy / Watch / Needs attention*. ✅
- **B.** A 1–5 score. 🔨
- **C.** A letter grade, A–D. 🔨

**Your pick:** ___

### A3. Who sets a group's grade, and how often?

- **A.** Just you / the admins, whenever you review. ✅
- **B.** The app calculates it automatically from the numbers (rolling), and
  you can override any group by hand. 🔨 *(manual override exists today)*
- **C.** Leaders give input on their own group, you finalize. 🏗️

**Your pick:** ___

*One more if you picked attendance (A1 A/B/C): how far back should "consistent"
look — the last **4 / 8 / 12 weeks**? (We default to 8 if you don't say.)*
**Window:** ___

### A4. Leader check-in reminders — one schedule, or tiered?

Today a leader is flagged "needs attention" when **nobody's connected in 60
days** — one number for everyone. You mentioned you're more hands-on with the
mixed/couples groups you oversee directly, and lighter on the men's/women's
groups that have an over-shepherd.

- **A.** Keep **one window for everyone** — simplest, works today. ✅
- **B.** Use **two windows** — shorter for groups you oversee directly, longer
  for groups an over-shepherd covers. 🔨

**Your pick:** ___

### A5. How long is "out of touch"?

The reminder above needs a number (changeable anytime — it's just a setting). ✅
If you picked two windows in A4, give a number for each.

- **A.** 30 days   **B.** 45 days   **C.** 60 days *(current)*   **D.** 90 days
  **E.** Other: ___

**Your pick:** ___   (direct groups: ___ / over-shepherd groups: ___)

### A6. The words for "how a leader is doing"

Today's three labels: **Healthy / Watch / Needs attention**. Earlier we floated:
*Doing well / Needs encouragement / Needs follow-up / Concern / Inactive.*

- **A.** Keep the current three. ✅
- **B.** Switch to the five-word set above. 🔨
- **C.** A different set — write them here: ___ 🔨

**Your pick:** ___

### A7. The multiplication plan — where should it live?

The app now has a built-in **multiplication pipeline**: list candidate groups,
mark readiness, set a **target year per group** (so 2026 vs 2027 is handled).
You also keep the Google Doc today.

- **A.** Move it **fully into the app** and retire the Google Doc. ✅
- **B.** Keep the **Google Doc as master**; the app just shows the counts. ✅
- **C.** Run **both** for a season, then decide. ✅

**Your pick:** ___

*If A or C: we'll need you to set each candidate group's target year (2026 vs
2027) once — the doc lists them but doesn't pin each group to a year.*

---

## B. Parked until after launch — no action needed now

These came up in your answers as "someday" items. They are **not** holding up
launch; we'll come back to them. Glance only if you want to weigh in early.

### B1. Over-shepherds helping keep the system updated 🏗️
Today your 3 over-shepherds can sign in and **see** the leaders they cover
(read-only). You said eventually you'd like them to update too, with "broad
notes given simplicity and confidentiality." Post-launch.

### B2. Leaders seeing their own care status 🏗️
You mentioned wanting "something for leaders at some point too." Post-launch;
needs its own privacy review (your private notes are never exposed to leaders).

### B3. Looping in the communications director 🏗️
A view-only window for them down the road, once "external" is defined.
Post-launch.

---

## Already handled — no need to ask

Built and shipped from your answers:

- **Private notes only you can read** — done. Locked so even other admins
  (and the platform owner) can't open them; only you can, via your passkey.
- **A follow-up / to-do list on each leader** — done (history log *and* tasks —
  the "both" you asked for).
- **"Group is full at 12, but leaders can keep it open"** — done.
- **Church-attendance % of people in groups** — done (you type the attendance
  number; the app shows the percentage).
