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

export function ThisWeekCard({ data }: { data: AdminDashboardData }) {
  const dueThisWeek = data.followUps.filter((f) => isDueThisWeek(f.dueDate));
  const lp = data.launchPlanning;
  const launchDate = lp.available ? lp.suggestedLaunchByDate : null;

  const rows: { label: string; detail: string }[] = [];

  if (dueThisWeek.length > 0) {
    rows.push({
      label: "Follow-ups due",
      detail:
        dueThisWeek.length === 1
          ? "1 due in the next 7 days"
          : `${dueThisWeek.length} due in the next 7 days`,
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
      {rows.length === 0 ? (
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
