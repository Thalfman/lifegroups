# Systems conversation — Julian's Q&A (2026-05-27)

Source: Julian's emailed answers (`Answers.pdf`) plus the questions Tom sent
(`Questions.md`), both supplied 2026-05-27. From Julian Guevara
(`guevara.j@foxvalleychurch.org`) to `tomhalfman22@gmail.com`,
**Wed, May 27, 2026 at 3:01 PM**. Attachment: the blank care spreadsheet
(captured in [`MIN_CARE_LIST_TEMPLATE.md`](./MIN_CARE_LIST_TEMPLATE.md)).

Both halves are now captured: **questions are verbatim from `Questions.md`**,
**answers are verbatim from Julian's email.** (An earlier capture had only the
answers and inferred the question topics; the actual questions are now folded in
below, which resolved two answers that were previously unattributable — Q6 and
Q8 — and corrected the Q5 framing.)

> Hey man! Hope these answer your questions you asked via text:

---

**Q1.** Could you share a blank version of the care spreadsheet, just the
headers/structure with no private info?

> Attached above

**Q2.** When you track "how a leader is doing," what categories do you naturally
think in? For example: doing well, needs encouragement, needs follow-up,
concern, inactive, etc.

> I just recently started doing the leader check-in (from a spreadsheet
> standpoint), but typically I think of categories such as if there's an issue
> and what the next step would be to solve it (i.e. Leader is discouraged with
> their life group, so I'm going to check-in next week etc.). I think having a
> category for every leader would be good though so I can make quick notes of
> how they are doing and how I can serve them. I also oversee 60+ leaders, so
> this would be broad breast strokes or specific concerns.

*Note: the question proposed a candidate status vocabulary (doing well / needs
encouragement / needs follow-up / concern / inactive). Julian did not adopt it
verbatim — see [`../GROUP_HEALTH_RUBRIC_DISCOVERY.md`](../plans/GROUP_HEALTH_RUBRIC_DISCOVERY.md)
for how this bears on the shipped `shepherd_care_status` enum.*

**Q3.** What do you usually want to remember after connecting with a leader?

> I usually want to remember what the issue/concern of the conversation was (or
> good thing) and if there needs to be follow up. If so, when that would happen
> and what that would be.

**Q4.** How do you decide someone needs a follow-up?

> I usually put concerns based on what I'm aware of (so them sharing it with me)
> and then I ask if I can follow up with them, then I jot it down.

**Q5.** How often do you ideally want to check in with each shepherd or leader?

> I technically oversee 60+ leaders (Shepherds) but for men's and women's
> groups, they have an over shepherd (coach). So, for the mixed/couples group I
> oversee (as life group director and their over shepherd), I'd like to be a
> little more in the weeds, compared to the men or women leaders since they have
> their over shepherd (where-as the mixed/couples groups have me).

*Note: the question was about cadence ("how often"). Julian's answer reframes
cadence as **tiered by oversight** — higher touch on the mixed/couples groups he
directly over-shepherds, delegated cadence for the men's/women's groups that have
their own over-shepherd. There is no single standing interval.*

**Q6.** Do you want the care tracker to be more like a history log, a
follow-up/task list, or both?

> Maybe both!

*Note: this directly answers the data-model question for Shepherd Care. "Both"
= history log **and** a task/follow-up list, which points to the **A1** model
(profiles + interactions + `shepherd_care_follow_ups`), i.e. SC.1B is wanted,
not optional. See [`MIN_CARE_LIST_TEMPLATE.md`](./MIN_CARE_LIST_TEMPLATE.md) and
[`../SHEPHERD_CARE_TRACKER_PLAN.md`](../plans/SHEPHERD_CARE_TRACKER_PLAN.md) §6.*

**Q7.** For the 3 over-shepherds, do you mainly want to track who they are
covering, or eventually have them help update the system too?

> I think have them update the system too, but broad notes given simplicity and
> confidentiality. I would also like something for leaders at some point too.

*Note: confirms there are exactly **3 over-shepherds** and that future write
access for over-shepherds/leaders should be limited to **broad** notes. Future
scope — see roadmap LDR.1.*

**Q8.** For the notes section, would you want any complete privacy/encryption
option for notes that should only be readable by you?

> Yes, that would be helpful.

*Note: this is a **net-new privacy requirement** — a tier of notes readable by
Julian only, excluding even `super_admin`. It is distinct from Q7's "broad
notes" and is **not** satisfied by the shipped admin-only RLS (which grants
SELECT to `super_admin` and `ministry_admin` alike). The Shepherd Care
foundation migration already deferred this "if Julian asks for" it — that trigger
is now met. Tracked as SC.4; see
[`../SHEPHERD_CARE_TRACKER_PLAN.md`](../plans/SHEPHERD_CARE_TRACKER_PLAN.md) §12.*

**Q9.** For launch planning, what numbers do you currently use or estimate?
Church attendance, people in groups, guests, expected growth, target group
size, or something else?

> I mainly use people in groups (which leaders update, at least that's the
> ideal), but know the church attendance numbers are extremely important (i.e.
> if 100 people are attending the church and there's 80 people in a life group,
> that's really encouraging because it shows 80% are in a group. Currently, we
> have about 60% ish in a life group, but still are figuring out best method to
> capture church numbers).

**Q10.** When would you consider a group "full" or close enough that a new group
should be launched?

> We consider a group full after 12 members, but give the leaders and the group
> the option to keep it opened if they'd like. Concerning group launch
> (multiplication) we have a few guidelines for this, but the three primary
> one's are when a group is 12+, been meeting for more than 3+ years, and
> there's a need for another similar life group.

**Q11.** Do you think about launch planning by season/month, like August or
January, or more generally as capacity fills up?

> Mainly by focusing on season/month (August and January, but especially
> August), but also generally given the season of the church. For example, right
> now I'm trying to launch enough groups so we can be ready to bring people in
> when we build the new worship center! I know there will be much interest, so we
> can to be ready as much as we can. Also, most people tend to join a group in
> the August/September season.

**Q12.** What would make this tool genuinely useful for you week to week?

> This tool to know how my leaders are doing, what groups need to be launched
> (and when), and the health of a life group (which im still working on an
> evaluation system of how we would grade them, like group is consistently
> attending, spiritual growth is happening, etc.). Currently I have a google doc
> that tracks when groups should multiply, but maybe something cleaner would be
> good. You can find the link here.

The "google doc that tracks when groups should multiply" is the source of
[`LG_MULTIPLICATION_PLAN_2026.md`](./LG_MULTIPLICATION_PLAN_2026.md).
[Google Doc link (in source)](https://docs.google.com/document/d/1xD0NVXYO3sOdKen9jupCSiMUyTdjUK_LdBdAEAjEPcE/edit?usp=sharing)

> Thanks Tom!!! Julian
