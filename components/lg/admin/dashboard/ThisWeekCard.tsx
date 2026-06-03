import { StatusCard } from "@/components/dashboard/cards";
import { P, fontBody } from "@/lib/pastoral";
import { formatIsoDate } from "@/lib/shared/date";
import type { AdminDashboardData } from "@/lib/dashboard/types";
import { OpenLink } from "./overview-primitives";

// "This Week" — the near-term horizon for Home's triage layout (#299): due
// follow-ups and the launch milestone, composed from data the dashboard already
// fetches (no new data source). Every row is metadata only — a count or a date,
// never a follow-up or note body — so this card is safe outside the guarded
// care/planning surfaces (ADR 0002). The single action lands on launch planning,
// where the week's launch work happens ("View planning").

function startOfTodayUtc(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

// A follow-up due within the next 7 days (inclusive of today and anything
// already overdue) — the "this week" window. Parsed in UTC to match the stored
// calendar day (see lib/shared/date.ts).
function isDueThisWeek(dueDate: string | null): boolean {
  if (!dueDate) return false;
  const [y, m, d] = dueDate.split("-").map((p) => Number.parseInt(p, 10));
  if (!y || !m || !d) return false;
  const due = Date.UTC(y, m - 1, d);
  const today = startOfTodayUtc();
  const weekAhead = today + 7 * 24 * 60 * 60 * 1000;
  return due <= weekAhead;
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
  // Only treat the suggested-launch milestone as week-ahead work when it
  // actually falls inside the same horizon a due follow-up would; a launch date
  // weeks/months out is long-range planning, not this week.
  const launchDate =
    lp.available && isDueThisWeek(lp.suggestedLaunchByDate)
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

  if (lp.available && lp.recommendedNewGroups > 0) {
    rows.push({
      label: "Recommended new groups",
      detail: String(lp.recommendedNewGroups),
    });
  }

  return (
    <StatusCard
      eyebrow="This week"
      title="The week ahead"
      action={<OpenLink href="/admin/launch-planning" label="View planning" />}
    >
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
