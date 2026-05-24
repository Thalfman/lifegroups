# Julian's Feedback — Product Pivot

## 1. Date and context

Julian reviewed an early version of the Life Group Operations Dashboard and
sent the feedback captured below. This document was authored around
**2026-05-21** as authorship context, not as a formal product milestone or
release date. The intent is to lock the new direction in writing before any
implementation phase begins.

### Julian's verbatim feedback (source of truth)

> Hey man! I'm sorry for the delayed reply. I just looked through it and like
> it! I think for now I would try to focus on something specifically for
> myself rather than the leaders, but definitely want to be thinking of them
> too! I probably will want to loop our communications director in too if
> there's something that becomes more external as well.
>
> I really liked the follow up page! There's 63 Life or Co Life Shepherds and
> 3 over shepherds (like coaches), so I primarily am training the over
> shepherds to be serving their leaders, but I also work heavily with leaders
> too. So, I have an excel spreadsheet that is specific to "caring" for
> people, so like putting a note in of how a leader is doing, when I
> connected with them, etc. but it's a very informal spreadsheet lol. I would
> love more help creating a system to track that (and maybe also for my over
> shepherds and leaders down the line).
>
> Another thing that I'm hoping to create is something that helps me track
> and anticipate how many people are in a life group, the church, and when
> we need to launch groups. For example, if we have 10 groups and there's
> 100 people in the church, we might anticipate in August there being 20
> more people who come, so I need to be ready to launch more groups, if that
> makes sense.
>
> I can share and text more thoughts next week, but these two things jump
> out to me. Thanks again for the help man! Let me know if you have any
> questions too.

## 2. What Julian liked

- The overall app.
- The follow-up page in particular.

## 3. What Julian actually needs next

- Something specifically for **himself** first.
- A personal / ministry-admin operating system.
- A replacement for his informal Excel "caring" spreadsheet.
- A way to track how each shepherd / leader is doing.
- A way to track when he last connected with each one.
- A way to track what he owes next (his next touchpoint).
- A way to track over-shepherd coverage — which over-shepherd is covering
  which shepherds.
- A way to anticipate capacity and decide when new Life Groups need to
  launch (the "10 groups, 100 people, 20 more coming in August" question).

## 4. Population context

- About **63 Life or Co-Life Shepherds** (the people leading or co-leading
  Life Groups).
- **3 over-shepherds / coaches** sitting above them.
- Julian primarily trains the over-shepherds to serve their leaders.
- Julian also works directly with leaders today.

## 5. Product implications

- Build **Julian's admin OS first** — not leader tools.
- Do not overbuild leader-facing workflows in this pivot.
- Keep over-shepherds and leaders in mind for later; do not assume them as
  MVP users.
- Care notes are sensitive. Treat them as more confidential than ordinary
  follow-ups.
- Care content is **admin-only at first**. No leader exposure in the MVP.
- Over-shepherd is a real operational concept — the MVP should help Julian
  **track over-shepherd coverage**, not build over-shepherd login views.
- Do not assume over-shepherd login access in the MVP.
- Capacity planning is a **first-class admin tool**, not a side metric on
  the dashboard.
- The communications director may be involved later — only if and when
  something becomes external / public / comms-related.

## 6. What moves down in priority

- Leader-facing enhancements beyond what already ships.
- Over-shepherd login access.
- SMS / email comms.
- Public / guest self-signup forms.
- Prayer-request features.
- An advanced / configurable dashboard builder.
- The deprecated Staff View. It remains deprecated.
- Native mobile app wrapper.
- External / public-facing workflows of any kind.

## 7. Updated north star

> Julian's admin operating system for shepherding and launch planning.

- Backed by the existing security model (RLS-first, narrow SECURITY DEFINER
  RPCs, audit events, no service role in Next runtime, no hard deletes in
  normal workflows).
- Reliability / security technical debt continues to be tracked separately
  in [`FINALIZED_HOLISTIC_PLAN.md`](./FINALIZED_HOLISTIC_PLAN.md) and is
  treated as an orthogonal north-star track that runs in parallel to this
  product roadmap.

## 8. Open questions for next meeting

To be answered with Julian before SC.1 implementation begins:

- What fields does Julian's current caring spreadsheet actually contain?
  (We need the column names before designing the care profile schema.)
- What does "doing well" vs. "needs attention" mean in his current mental
  model? Are there obvious status buckets?
- What care cadence does Julian want? Weekly touchpoint per shepherd,
  monthly check-in, or custom per shepherd?
- Should over-shepherd coverage be tracked **as assignment only**, or
  should over-shepherds eventually see their assigned shepherds?
- If over-shepherds eventually see anything, should they see care notes?
  Read-only or edit?
- Should leaders ever see any version of **their own** care status later,
  or should this remain strictly admin-only?
- Should care notes include private pastoral content, or should the most
  sensitive content stay outside the app entirely?
- For capacity planning: what is the demand model? Church attendance,
  guests, expected attendance growth, active members, or some combination?
- Does Julian want a "you have not connected with this shepherd in X
  weeks" auto-flag? If so, what's the default threshold?
- When does Julian expect to loop in the communications director, and on
  what kind of work?
- What data should never leave the Julian / admin context, even later?
