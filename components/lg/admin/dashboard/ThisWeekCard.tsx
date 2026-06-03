import { StatusCard } from "@/components/dashboard/cards";
import { P, fontBody } from "@/lib/pastoral";
import { formatIsoDate } from "@/lib/shared/date";
import type { AdminDashboardData } from "@/lib/dashboard/types";
import { OpenLink } from "./overview-primitives";

// "This Week" — the near-term horizon for Home's triage layout (#299): due
// follow-ups and the launch milestone, composed from data the dashboard already
// fetches (no new data source). Every row is metadata only — a count or a date,
// never a follow-up or note body — so this card is safe outside the guarded
// care/planning surfaces (ADR 0002). The action follows the week's work: when
// follow-ups are due it lands on the dedicated follow-up workflow
// (/admin/follow-ups, where admins can actually act on them); otherwise it lands
// on launch planning, where the week's launch milestone is worked.

// A calendar date that falls on or before the shared "week ahead" horizon
// (today + 7 days, inclusive of overdue) the data layer already derived. Both
// dates are YYYY-MM-DD church-local strings, so a lexicographic compare is the
// same-day comparison — no second (UTC) horizon, so the launch milestone and
// the due-follow-up count can't disagree by a day across the UTC/church-local
// boundary (Codex round 3).
function isOnOrBeforeCutoff(
  dueDate: string | null,
  cutoffIso: string
): boolean {
  if (!dueDate) return false;
  return dueDate <= cutoffIso;
}

function Row({ label, detail }: { label: string; detail: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 12,
        padding: "8px 0",
        borderBottom: `1px solid ${P.line2}`,
      }}
    >
      <span style={{ fontFamily: fontBody, fontSize: 13.5, color: P.ink2 }}>
        {label}
      </span>
      <span
        style={{
          fontFamily: fontBody,
          fontSize: 13,
          color: P.ink3,
          textAlign: "right",
        }}
      >
        {detail}
      </span>
    </div>
  );
}

export function ThisWeekCard({
  data,
  degraded,
}: {
  data: AdminDashboardData;
  // The dashboard read degraded to demo fallback; suppress the week-ahead data
  // so its counts and dates are never mistaken for live work — matching how
  // NeedsAttentionArea / buildNeedsAttentionItems treat degraded (contribute
  // nothing).
  degraded?: boolean;
}) {
  // Accurate, UNtruncated count of OPEN follow-ups due this week (data layer
  // counts every match, not just the first capped rows the card can see).
  const dueThisWeekCount = data.dueFollowUpsThisWeekCount;
  const lp = data.launchPlanning;
  // Launch planning is a read OUTSIDE the whole-dashboard error gate, so it can
  // be unavailable even on an otherwise-live page. Surface that as its own
  // partial row (below) rather than letting the launch milestone silently drop
  // — "Nothing scheduled" would tell the admin there's no launch work when the
  // launch data is actually just unavailable (Codex round 3).
  const launchUnavailable = !lp.available;
  // Only treat the suggested-launch milestone as week-ahead work when it falls
  // inside the SAME shared church-local horizon the due-follow-up count used
  // (data.weekAheadCutoffIso); a launch date weeks/months out is long-range
  // planning, not this week.
  const launchDate =
    lp.available &&
    isOnOrBeforeCutoff(lp.suggestedLaunchByDate, data.weekAheadCutoffIso)
      ? lp.suggestedLaunchByDate
      : null;

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

  if (launchDate) {
    rows.push({
      label: "Suggested launch by",
      detail: formatIsoDate(launchDate),
    });
  }

  // The capacity figure is only this-week work when the launch it drives falls
  // inside the week-ahead window; gated behind `launchDate` (same horizon as the
  // launch-date row) so long-range capacity planning doesn't surface under
  // "This week". When the launch is out of window the row drops with the date.
  if (launchDate && lp.available && lp.recommendedNewGroups > 0) {
    rows.push({
      label: "Recommended new groups",
      detail: String(lp.recommendedNewGroups),
    });
  }

  // Launch planning failed to read (but the page is otherwise live): show a
  // metadata-only note for the launch portion so the admin knows the launch
  // outlook is unavailable rather than empty. Follow-up rows still render
  // normally above. Suppressed when the whole dashboard degraded (that path
  // hides the card's data entirely below).
  if (launchUnavailable && !degraded) {
    rows.push({
      label: "Launch outlook",
      detail: "Unavailable right now",
    });
  }

  // Route the single action to the workflow where this week's work is actually
  // done: due follow-ups take priority (they're the immediately-actionable
  // work) and land on the dedicated follow-up surface; otherwise the action
  // points at launch planning for the launch milestone.
  const action =
    dueThisWeekCount > 0 ? (
      <OpenLink href="/admin/follow-ups" label="Work follow-ups" />
    ) : (
      <OpenLink href="/admin/launch-planning" label="View planning" />
    );

  return (
    <StatusCard eyebrow="This week" title="The week ahead" action={action}>
      {degraded ? (
        <p
          style={{
            margin: 0,
            fontFamily: fontBody,
            fontSize: 13,
            color: P.ink3,
          }}
        >
          The week ahead is unavailable right now.
        </p>
      ) : rows.length === 0 ? (
        <p
          style={{
            margin: 0,
            fontFamily: fontBody,
            fontSize: 13,
            color: P.ink3,
          }}
        >
          Nothing scheduled for the week ahead.
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
