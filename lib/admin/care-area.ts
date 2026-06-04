import {
  differenceInDaysIso,
  type CareFollowUpCompletedRow,
  type CareFollowUpDashboardRow,
  type ShepherdCareDirectoryEntry,
  type ShepherdCareRecentInteractionRow,
} from "@/lib/supabase/read-models";
import type { CareAttentionItem } from "@/lib/admin/shepherd-care-dashboard";
import { shepherdCareInteractionTypeLabel } from "@/lib/dashboard/labels";
import { formatIsoDateOr } from "@/lib/shared/date";

// The Care area (#301) reorganizes the existing leader-care signals into five
// urgency/completion buckets — Needs Contact, Follow-ups, Due Soon, Recent
// Care, Completed. This module is the pure mapping from the loaded reads to the
// uniform care-item rows each tab renders (Follow-ups is the separate generic
// queue, handled in the page). It reads no note bodies — reasons are derived
// from status + dates only — so the aggregate surface never leaks private care
// content (the care-note boundary stays on the per-leader detail page).

export type CareItemActionLabel =
  | "Log contact"
  | "Create follow-up"
  | "View follow-up"
  | "Mark complete"
  | "Add note";

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
  actionHref: string;
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
  const days = daysFromToday(dueIso, todayIso);
  if (days === 0) return "Due today";
  if (days < 0) {
    const abs = Math.abs(days);
    return abs === 1 ? "Overdue 1 day" : `Overdue ${abs} days`;
  }
  return days === 1 ? "Due tomorrow" : `Due in ${days} days`;
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

  // --- Needs Contact: every leader/co-leader the attention engine flags. ---
  const needsContact: CareItem[] = input.attentionQueue.map((item) => {
    const due = nextTouchpointByShepherdId.get(item.shepherdProfileId) ?? null;
    return {
      key: item.shepherdProfileId,
      personName: item.shepherdName,
      reason: item.detail,
      groupName: groupOf(item.shepherdProfileId),
      dueLabel: due ? dueLabelFor(due, input.todayIso) : null,
      dueTone: due ? dueToneFor(due, input.todayIso, window) : "neutral",
      ownerName: ownerOf(item.shepherdProfileId),
      actionLabel: "Log contact",
      actionHref: careDetailHref(item.shepherdProfileId),
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
        actionLabel: "View follow-up",
        actionHref: careDetailHref(shepherd.shepherdId, "follow-ups"),
      },
    });
  }
  // Most overdue (smallest/most-negative days) first; ties broken by name.
  dueSoonRows.sort(
    (a, b) =>
      a.days - b.days || a.item.personName.localeCompare(b.item.personName)
  );
  const dueSoon: CareItem[] = dueSoonRows.map((r) => r.item);

  // --- Recent Care: recently logged calls / notes / meetings / texts. ---
  const recentCare: CareItem[] = input.recentInteractions.map((row) => ({
    key: `int-${row.id}`,
    personName: row.shepherd_full_name,
    reason: shepherdCareInteractionTypeLabel(row.interaction_type),
    groupName: groupOf(row.shepherd_profile_id),
    dueLabel: formatIsoDateOr(row.interaction_at, "—"),
    dueTone: "neutral",
    ownerName: ownerOf(row.shepherd_profile_id),
    actionLabel: "Add note",
    // Overview hosts the care-action forms (log a contact, add a summary);
    // Contact History is read-only, so "Add note" must land on Overview.
    actionHref: careDetailHref(row.shepherd_profile_id, "overview"),
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
      actionLabel: "View follow-up",
      actionHref: careDetailHref(shepherd.shepherdId, "follow-ups"),
    });
  }

  return { needsContact, dueSoon, recentCare, completed };
}
