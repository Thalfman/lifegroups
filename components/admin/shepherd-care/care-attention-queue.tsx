import Link from "next/link";
import { StatusCard, EmptyState } from "@/components/dashboard/cards";
import { Badge, STATUS_TONES, type BadgeTone } from "@/components/ui/badge";
import { CareLeaderActionsMenu } from "@/components/admin/care/care-row-actions";
import type { UserRole } from "@/lib/auth/roles";
import type {
  CareAttentionItem,
  CareAttentionReason,
} from "@/lib/admin/shepherd-care-dashboard";

const REASON_LABEL: Record<CareAttentionReason, string> = {
  overdue_touchpoint: "Overdue",
  overdue_care_follow_up: "Follow-up due",
  concern_status: "Concern",
  needs_follow_up_status: "Needs follow-up",
  no_contact_yet: "No contact",
  stale_last_contact: "Stale contact",
  no_over_shepherd: "No over-shepherd",
  needs_encouragement_status: "Needs encouragement",
};

// Attention reasons on the status vocabulary: overdue / needs-follow-up =
// clay, concern = rose, watch-level staleness = amber, coverage gaps stay
// neutral.
const REASON_TONE: Record<CareAttentionReason, BadgeTone> = {
  overdue_touchpoint: STATUS_TONES.followUp,
  overdue_care_follow_up: STATUS_TONES.followUp,
  concern_status: STATUS_TONES.concern,
  needs_follow_up_status: STATUS_TONES.followUp,
  no_contact_yet: STATUS_TONES.watch,
  stale_last_contact: STATUS_TONES.watch,
  no_over_shepherd: "neutral",
  needs_encouragement_status: STATUS_TONES.watch,
};

function ReasonBadge({ reason }: { reason: CareAttentionReason }) {
  return <Badge tone={REASON_TONE[reason]}>{REASON_LABEL[reason]}</Badge>;
}

export function CareAttentionQueue({
  items,
  totalCount,
  rosterFiltered = false,
  viewerRole,
}: {
  items: CareAttentionItem[];
  totalCount: number;
  rosterFiltered?: boolean;
  // #781 OPP-7 — when an admin viewer is supplied, each row carries the same
  // per-leader contextual action menu the Care accordion / Notes feed use, so a
  // triage sweep can log a touchpoint / set the next step / create a follow-up
  // in place instead of bouncing off the dashboard to the leader's care page.
  // Every queued shepherd is an active leader (the dashboard model is built from
  // the active-shepherd care directory), so they are all safe to act on. Omitted
  // for non-admin contexts, where no contextual action resolves anyway.
  viewerRole?: UserRole;
}) {
  // #477: the queue sits directly above the full roster on the All-leaders
  // tab, so the former cross-tab "View in Directory" links are gone — the
  // footer simply points at the roster below. The queue includes reasons
  // (no_over_shepherd, needs_encouragement, overdue follow-up) that don't set
  // a row's `needs_attention` flag, so the roster's needs-attention filter is
  // deliberately narrower than this queue. While that filter is active some
  // queued leaders are hidden from the roster, so the footer must point at
  // the All chip instead of claiming everyone is visible below.
  const remaining = totalCount - items.length;
  return (
    <StatusCard eyebrow="Triage queue" title="Needs attention this week">
      {items.length === 0 ? (
        <EmptyState
          title="Nothing urgent right now"
          description="No shepherds match the attention rules today. Keep checking back as touchpoints come due."
        />
      ) : (
        <div>
          {items.map((item) => (
            // The row is no longer a single wrapping link: the contextual action
            // menu is interactive and must not nest inside an anchor (#781
            // OPP-7). The navigational part (name + detail + reasons) stays a
            // link to the leader's care page; the reason badge and the action
            // menu sit beside it in a link-free column.
            <div
              key={item.shepherdProfileId}
              className="flex min-h-11 items-start justify-between gap-3 border-b border-lineSoft py-3"
            >
              <Link
                href={item.href}
                className="min-w-0 flex-1 rounded-sm text-inherit no-underline transition-colors duration-150 hover:bg-surfaceAlt"
              >
                <div className="font-sans text-base font-semibold text-ink [overflow-wrap:anywhere]">
                  {item.shepherdName}
                </div>
                <div className="mt-0.5 font-sans text-sm italic text-ink2">
                  {item.detail}
                </div>
                {item.secondaryReasons.length > 0 ? (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {item.secondaryReasons.map((r) => (
                      <Badge key={r} tone="ghost">
                        {REASON_LABEL[r]}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </Link>
              <div className="flex shrink-0 items-center gap-2">
                <ReasonBadge reason={item.reason} />
                {viewerRole ? (
                  <CareLeaderActionsMenu
                    leaderProfileId={item.shepherdProfileId}
                    leaderName={item.shepherdName}
                    viewerRole={viewerRole}
                  />
                ) : null}
              </div>
            </div>
          ))}
          {remaining > 0 ? (
            <div className="mt-2.5 text-right font-sans text-sm italic text-ink3">
              {rosterFiltered
                ? `+${remaining} more — switch the roster filter to All to see everyone`
                : `+${remaining} more in the full roster below`}
            </div>
          ) : null}
        </div>
      )}
    </StatusCard>
  );
}
