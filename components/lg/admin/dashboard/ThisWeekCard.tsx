import { StatusCard } from "@/components/dashboard/cards";
import type { AdminDashboardData } from "@/lib/dashboard/types";
import { OpenLink } from "./overview-primitives";

// "This Week" — the near-term horizon for Home's triage layout (#299): the
// follow-ups due in the week ahead, composed from data the dashboard already
// fetches (no new data source). Every row is metadata only — a count, never a
// follow-up or note body — so this card is safe outside the guarded care
// surfaces (ADR 0002). The single action lands on the dedicated follow-up
// workflow (/admin/follow-ups, which alias-renders the active Care Follow-ups
// tab, where admins can actually act).
//
// The launch-planning milestone/capacity rows were removed in the Care/Plan/
// Multiply pivot (ADR 0016): launch planning is a hidden surface Julian tracks
// elsewhere, so Home no longer surfaces its dates or capacity here. The deeper
// LaunchPlanningOverviewCard still returns if a Super Admin re-shows Planning.

function Row({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-lineSoft py-2">
      <span className="font-sans text-base text-ink2">{label}</span>
      <span className="text-right font-sans text-sm text-ink3">{detail}</span>
    </div>
  );
}

export function ThisWeekCard({
  data,
  degraded,
}: {
  data: AdminDashboardData;
  // The dashboard read degraded to demo fallback; suppress the week-ahead data
  // so its counts are never mistaken for live work — matching how
  // NeedsAttentionArea / buildNeedsAttentionItems treat degraded (contribute
  // nothing).
  degraded?: boolean;
}) {
  // Accurate, UNtruncated count of OPEN follow-ups due this week (data layer
  // counts every match, not just the first capped rows the card can see).
  const dueThisWeekCount = data.dueFollowUpsThisWeekCount;

  const rows: { label: string; detail: string }[] = [];

  if (dueThisWeekCount > 0) {
    rows.push({
      label: "Follow-ups due",
      detail:
        dueThisWeekCount === 1
          ? "1 due in the next 7 days"
          : `${dueThisWeekCount} due in the next 7 days`,
    });
  }

  // The single action lands on the follow-up workflow when there is work to do;
  // otherwise the card is purely informational, so it carries no action.
  const action =
    dueThisWeekCount > 0 ? (
      <OpenLink href="/admin/follow-ups" label="Work follow-ups" />
    ) : undefined;

  // No eyebrow: the section label is sr-only and this serif title is the one
  // visible "This week" label (single label, not three).
  return (
    <StatusCard title="The week ahead" action={action}>
      {degraded ? (
        <p className="m-0 font-sans text-sm text-ink3">
          The week ahead is unavailable right now.
        </p>
      ) : rows.length === 0 ? (
        <p className="m-0 font-sans text-sm text-ink3">
          The week ahead is clear. No follow-ups are due.
        </p>
      ) : (
        <div>
          {rows.map((r) => (
            <Row key={r.label} label={r.label} detail={r.detail} />
          ))}
        </div>
      )}
    </StatusCard>
  );
}
