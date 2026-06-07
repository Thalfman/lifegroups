import {
  differenceInDaysIso,
  type CareFollowUpCompletedRow,
  type CareFollowUpDashboardRow,
  type ShepherdCareDirectoryEntry,
  type ShepherdCareRecentInteractionRow,
} from "@/lib/supabase/read-models";
import type { CareAttentionItem } from "@/lib/admin/shepherd-care-dashboard";
import { formatDueLabel } from "@/lib/admin/care-temporal";
import { shepherdCareInteractionTypeLabel } from "@/lib/dashboard/labels";
import { formatIsoDateOr } from "@/lib/shared/date";
import {
  careActionAccessibleName,
  resolveAttentionNextAction,
  resolveOpenFollowUpNextAction,
} from "@/lib/admin/care-next-action";

// The Care area (#301) reorganizes the existing leader-care signals into five
// urgency/completion buckets — Needs Contact, Follow-ups, Due Soon, Recent
// Care, Completed. This module is the pure mapping from the loaded reads to the
// uniform care-item rows each tab renders (Follow-ups is the separate generic
// queue, handled in the page). It reads no note bodies — reasons are derived
// from status + dates only — so the aggregate surface never leaks private care
// content (the care-note boundary stays on the per-leader detail page).

// Every actionable care item surfaces ONE of the four canonical next actions
// (#332); the resolver in care-next-action.ts decides which per item. "View
// follow-up" is the only non-action label — a completed follow-up is a closed
// record with no next action, so its row links read-only to the history.
export type CareItemActionLabel =
  | "Log contact"
  | "Assign over-shepherd"
  | "Schedule touchpoint"
  | "Resolve follow-up"
  | "View follow-up";

export type CareItemDueTone = "overdue" | "soon" | "neutral";

export type CareItem = {
  // Unique within its list (shepherd id, or follow-up-scoped composite).
  key: string;
  personName: string;
  reason: string;
  // The leader's group(s). Null renders as a muted "—".
  groupName: string | null;
  // Human due/date label ("Due today", "Overdue 2 days", "Jan 4"). Null = none.
  dueLabel: string | null;
  dueTone: CareItemDueTone;
  // Coverage owner ("Tom"), or null for unassigned.
  ownerName: string | null;
  actionLabel: CareItemActionLabel;
  // Record-context accessible name for the action trigger, e.g. "Log contact
  // for Jane Doe" (#332 / req 4) — never a bare "Log contact". The visible
  // label stays the short verb; this is what assistive tech announces.
  actionAccessibleName: string;
  actionHref: string;
  // SAD9: the underlying deletable DB row for the Super-Admin-only inline Delete
  // control, or null when the item is a derived aggregate with no single row
  // (needsContact). dueSoon/completed map to the care follow-up; recentCare maps
  // to the interaction log row. Notes & prayer requests are never surfaced here.
  deleteTarget: { entityType: string; id: string } | null;
};

export type CareArea = {
  needsContact: CareItem[];
  dueSoon: CareItem[];
  recentCare: CareItem[];
  completed: CareItem[];
};

export type BuildCareAreaInput = {
  entries: ShepherdCareDirectoryEntry[];
  // Full attention queue (not the dashboard's top-N slice) so Needs Contact
  // lists every leader/co-leader who needs outreach.
  attentionQueue: CareAttentionItem[];
  outstandingFollowUps: CareFollowUpDashboardRow[];
  completedFollowUps: CareFollowUpCompletedRow[];
  recentInteractions: ShepherdCareRecentInteractionRow[];
  ownerNameByShepherdId: Map<string, string>;
  groupNameByShepherdId: Map<string, string>;
  todayIso: string;
  // Due-soon horizon in days (inclusive). Follow-ups overdue or due within this
  // many days land in Due Soon.
  dueSoonWindowDays?: number;
};

const DEFAULT_DUE_SOON_WINDOW_DAYS = 7;

function careDetailHref(shepherdProfileId: string, tab?: string): string {
  const base = `/admin/shepherd-care/${shepherdProfileId}`;
  return tab ? `${base}?tab=${tab}` : base;
}

// daysFromToday: negative = overdue, positive = upcoming (mirrors the dashboard
// so Due Soon and the triage queue agree on what "overdue" means).
function daysFromToday(dueIso: string, todayIso: string): number {
  return -differenceInDaysIso(todayIso, dueIso);
}

function dueLabelFor(dueIso: string, todayIso: string): string {
  return formatDueLabel(daysFromToday(dueIso, todayIso));
}

function dueToneFor(
  dueIso: string,
  todayIso: string,
  windowDays: number
): CareItemDueTone {
  const days = daysFromToday(dueIso, todayIso);
  if (days < 0) return "overdue";
  if (days <= windowDays) return "soon";
  return "neutral";
}

export function buildCareArea(input: BuildCareAreaInput): CareArea {
  const window = input.dueSoonWindowDays ?? DEFAULT_DUE_SOON_WINDOW_DAYS;

  // care_profile_id -> { shepherdId, name } so the follow-up feeds (keyed by
  // care profile) can resolve the leader they belong to.
  const shepherdByCareProfileId = new Map<
    string,
    { shepherdId: string; name: string }
  >();
  const nextTouchpointByShepherdId = new Map<string, string>();
  for (const entry of input.entries) {
    if (entry.care) {
      shepherdByCareProfileId.set(entry.care.id, {
        shepherdId: entry.profile.id,
        name: entry.profile.full_name,
      });
      if (entry.care.next_touchpoint_due) {
        nextTouchpointByShepherdId.set(
          entry.profile.id,
          entry.care.next_touchpoint_due
        );
      }
    }
  }

  const groupOf = (shepherdId: string) =>
    input.groupNameByShepherdId.get(shepherdId) ?? null;
  const ownerOf = (shepherdId: string) =>
    input.ownerNameByShepherdId.get(shepherdId) ?? null;

  // --- Needs Contact: every leader/co-leader the attention engine flags. The
  // obvious next action is resolved per item from the item's PRIMARY attention
  // reason (#332): when a leader is flagged primarily for an overdue care
  // follow-up, the next step is to resolve that follow-up (Follow-ups tab), not
  // a coverage/touchpoint/log-contact action on Overview. Otherwise the
  // outreach precedence applies — an uncovered leader needs an over-shepherd
  // first, one with no scheduled touchpoint needs one set, and otherwise the
  // action is to log the contact. ---
  const needsContact: CareItem[] = input.attentionQueue.map((item) => {
    const owner = ownerOf(item.shepherdProfileId);
    const due = nextTouchpointByShepherdId.get(item.shepherdProfileId) ?? null;
    const next = resolveAttentionNextAction(item.reason, {
      hasOverShepherd: owner !== null,
      hasScheduledTouchpoint: due !== null,
    });
    return {
      key: item.shepherdProfileId,
      personName: item.shepherdName,
      reason: item.detail,
      groupName: groupOf(item.shepherdProfileId),
      dueLabel: due ? dueLabelFor(due, input.todayIso) : null,
      dueTone: due ? dueToneFor(due, input.todayIso, window) : "neutral",
      ownerName: owner,
      actionLabel: next.label as CareItemActionLabel,
      actionAccessibleName: careActionAccessibleName(
        next.label,
        item.shepherdName
      ),
      actionHref: careDetailHref(item.shepherdProfileId, next.tab),
      // A derived attention aggregate keyed by leader — no single deletable row.
      deleteTarget: null,
    };
  });

  // --- Due Soon: care follow-ups overdue or due within the window, sorted by
  // urgency (most overdue first) so the triage tab leads with what's late. ---
  const dueSoonRows: { item: CareItem; days: number }[] = [];
  for (const fu of input.outstandingFollowUps) {
    if (fu.status === "done") continue; // feed is not-done, but be defensive
    if (!fu.due_date) continue;
    const days = daysFromToday(fu.due_date, input.todayIso);
    if (days > window) continue; // not due yet
    const shepherd = shepherdByCareProfileId.get(fu.care_profile_id);
    if (!shepherd) continue; // follow-up for an off-directory leader
    // An open follow-up's obvious next action is to resolve it (#332).
    const next = resolveOpenFollowUpNextAction();
    dueSoonRows.push({
      days,
      // Key on the follow-up id: a leader can have several follow-ups due on
      // the same date, so a (profile, date) key would collide and let React
      // reuse the wrong row.
      item: {
        key: `fu-${fu.id}`,
        personName: shepherd.name,
        reason: days < 0 ? "Follow-up overdue" : "Follow-up due soon",
        groupName: groupOf(shepherd.shepherdId),
        dueLabel: dueLabelFor(fu.due_date, input.todayIso),
        dueTone: dueToneFor(fu.due_date, input.todayIso, window),
        ownerName: ownerOf(shepherd.shepherdId),
        actionLabel: next.label as CareItemActionLabel,
        actionAccessibleName: careActionAccessibleName(
          next.label,
          shepherd.name
        ),
        actionHref: careDetailHref(shepherd.shepherdId, next.tab),
        deleteTarget: { entityType: "shepherd_care_follow_up", id: fu.id },
      },
    });
  }
  // Most overdue (smallest/most-negative days) first; ties broken by name.
  dueSoonRows.sort(
    (a, b) =>
      a.days - b.days || a.item.personName.localeCompare(b.item.personName)
  );
  const dueSoon: CareItem[] = dueSoonRows.map((r) => r.item);

  // --- Recent Care: recently logged calls / notes / meetings / texts. The
  // obvious next action after a logged contact is to keep the cadence going by
  // logging the next one (#332); Overview hosts the log form (Contact History
  // is read-only). ---
  const recentCare: CareItem[] = input.recentInteractions.map((row) => ({
    key: `int-${row.id}`,
    personName: row.shepherd_full_name,
    reason: shepherdCareInteractionTypeLabel(row.interaction_type),
    groupName: groupOf(row.shepherd_profile_id),
    dueLabel: formatIsoDateOr(row.interaction_at, "—"),
    dueTone: "neutral",
    ownerName: ownerOf(row.shepherd_profile_id),
    actionLabel: "Log contact",
    actionAccessibleName: careActionAccessibleName(
      "Log contact",
      row.shepherd_full_name
    ),
    actionHref: careDetailHref(row.shepherd_profile_id, "overview"),
    deleteTarget: { entityType: "shepherd_care_interaction", id: row.id },
  }));

  // --- Completed: recently completed care follow-ups. ---
  const completed: CareItem[] = [];
  for (const fu of input.completedFollowUps) {
    const shepherd = shepherdByCareProfileId.get(fu.care_profile_id);
    if (!shepherd) continue;
    completed.push({
      key: `done-${fu.id}`,
      personName: shepherd.name,
      reason: "Follow-up completed",
      groupName: groupOf(shepherd.shepherdId),
      dueLabel: fu.completed_at
        ? formatIsoDateOr(fu.completed_at.slice(0, 10), "—")
        : null,
      dueTone: "neutral",
      ownerName: ownerOf(shepherd.shepherdId),
      // A completed follow-up is a closed record — no next action, just a
      // read-only link to the history.
      actionLabel: "View follow-up",
      actionAccessibleName: `View follow-up for ${shepherd.name}`,
      actionHref: careDetailHref(shepherd.shepherdId, "follow-ups"),
      deleteTarget: { entityType: "shepherd_care_follow_up", id: fu.id },
    });
  }

  return { needsContact, dueSoon, recentCare, completed };
}
