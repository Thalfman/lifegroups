import Link from "next/link";
import { notFound } from "next/navigation";
import { PastoralAppShell } from "@/components/pastoral/shell";
import { UserPill } from "@/components/auth/user-pill";
import { LogoutButton } from "@/components/auth/logout-button";
import { AdminMasterCalendarShell } from "@/components/admin/admin-master-calendar-shell";
import { Card } from "@/components/pastoral/primitives";
import { requireAdmin } from "@/lib/auth/session";
import { navItemsForRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadMasterCalendar } from "@/lib/admin/master-calendar";
import {
  churchMonthIso,
  monthBounds,
  monthLabel,
  shiftMonthIso,
  todayChurchIso,
} from "@/lib/calendar/occurrences";

export const dynamic = "force-dynamic";

type SearchParams = { month?: string | string[] };

// Tight month validation: a YYYY-MM string is only accepted when it
// also resolves to valid month bounds. This rejects out-of-range
// inputs like `?month=2026-13` that the regex alone would let through
// and that would otherwise render an empty calendar with a bogus
// month label.
function pickMonthParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;
  if (!/^\d{4}-\d{2}$/.test(raw)) return null;
  return monthBounds(raw) ? raw : null;
}

const navLinkStyle: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: 12.5,
  fontWeight: 500,
  color: "var(--c-ink2)",
  textDecoration: "none",
  padding: "7px 12px",
  borderRadius: 999,
  border: "1px solid var(--c-line)",
  background: "var(--c-surface)",
};

export default async function AdminMasterCalendarPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const session = await requireAdmin();
  const params = (await searchParams) ?? {};
  const monthIso = pickMonthParam(params.month) ?? churchMonthIso();

  const client = await createSupabaseServerClient();
  if (!client) notFound();

  const data = await loadMasterCalendar(client, { monthIso });
  const todayIso = todayChurchIso();
  const prevMonth = shiftMonthIso(monthIso, -1);
  const nextMonth = shiftMonthIso(monthIso, 1);

  return (
    <PastoralAppShell
      persona="admin"
      navItems={navItemsForRole(session.profile.role)}
      currentUser={{
        name: session.profile.full_name,
        email: session.profile.email,
        role: session.profile.role,
      }}
      eyebrow="Calendar"
      title="Ministry calendar"
      lede="A read-only view of every active group's meetings, OFF weeks, and special gatherings. Click any occurrence to see the details or jump into that group's calendar to make changes."
      headerSlot={
        <>
          <UserPill
            name={session.profile.full_name}
            email={session.profile.email}
            role={session.profile.role}
          />
          <LogoutButton />
        </>
      }
    >
      <div style={{ display: "grid", gap: 16 }}>
        <Card
          padded={false}
          style={{
            padding: "14px 18px",
            display: "flex",
            gap: 14,
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 20,
              fontWeight: 500,
              color: "var(--c-ink)",
              letterSpacing: -0.3,
            }}
          >
            {monthLabel(monthIso)}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {prevMonth ? (
              <Link href={`/admin/calendar?month=${prevMonth}`} style={navLinkStyle}>
                ← {monthLabel(prevMonth)}
              </Link>
            ) : null}
            <Link href="/admin/calendar" style={navLinkStyle}>
              This month
            </Link>
            {nextMonth ? (
              <Link href={`/admin/calendar?month=${nextMonth}`} style={navLinkStyle}>
                {monthLabel(nextMonth)} →
              </Link>
            ) : null}
          </div>
        </Card>

        <AdminMasterCalendarShell
          monthIso={monthIso}
          todayIso={todayIso}
          occurrences={data.occurrences}
          groups={data.groups}
          leaderOptions={data.leaderOptions}
        />
      </div>
    </PastoralAppShell>
  );
}
