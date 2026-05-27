# Min. care list — spreadsheet template (2026-05-27)

Source: `Sample copy of LG min. care list.xlsx` (attachment to the
[systems conversation](./SYSTEMS_CONVERSATION.md)). This is Julian's informal
"caring" spreadsheet — the one the Shepherd Care module replaces.

The file contained **only a header row** (`Sheet1`, range `A1:G1`); no leader
or care data was filled in. The columns, in order:

| # | Column header | Notes |
|---|---|---|
| A | `Name` | The leader / shepherd being cared for. |
| B | `Issue` | The concern or topic of the conversation. |
| C | `Date of first communication` | When the conversation / concern started. |
| D | `Next step` | What follow-up is needed. |
| E | `Update of communication` | Running update on the conversation. |
| F | *(blank column)* | Empty header in the source; likely a spacer. |
| G | `Misc. note` | Free-text catch-all. |

## How this maps to the shipped schema

These columns confirm the field set behind `shepherd_care_profiles` /
`shepherd_care_interactions` (see
[`../SHEPHERD_CARE_TRACKER_PLAN.md`](../SHEPHERD_CARE_TRACKER_PLAN.md)):

- `Name` → the `profiles` row the care profile attaches to.
- `Issue` + `Misc. note` → `admin_summary` (profile) and interaction `notes`.
- `Date of first communication` → first interaction's `interaction_at`;
  `last_contact_at` is maintained as interactions accrue.
- `Next step` → `next_touchpoint_due` plus (in the A1 variant) a
  `shepherd_care_follow_ups` row.
- `Update of communication` → the append-only `shepherd_care_interactions` log.

The roadmap left "what fields does Julian's current spreadsheet actually
contain?" as an open question to confirm before SC follow-on work; this answers
it. The spreadsheet is **note- and date-oriented**, not heavy on discrete
tasks/reminders — which, per `SHEPHERD_CARE_TRACKER_PLAN.md §6`, points to the
**A2** model (profiles + interactions) being sufficient, with care follow-ups
optional.
