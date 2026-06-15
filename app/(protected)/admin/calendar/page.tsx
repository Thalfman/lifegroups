import { requireAdmin } from "@/lib/auth/session";
import { FrozenSurfaceBanner } from "@/components/lg/FrozenSurfaceBanner";
import { PlanningView } from "@/components/admin/planning/planning-view";
import { monthBounds } from "@/lib/calendar/occurrences";
import { churchMonthIso } from "@/lib/shared/church-time";

// Frozen /admin/calendar alias (ADR 0013, #329). This is a THIN entry to the
// canonical Planning shell: it renders the shared PlanningView at the Calendar
// tab. Alias-render — a 200 at the matching tab, never a 302 redirect — so the
// surface keeps its own URL but shares ONE loader + shell (and the same master
// calendar data path, via PlanningCalendarPanel) with the canonical
// /admin/planning route. The sidebar marks Planning active for this URL via the
// alias→canonical map (#321).
export const dynamic = "force-dynamic";

type SearchParams = { month?: string | string[] };

function pickMonthParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;
  if (!/^\d{4}-\d{2}$/.test(raw)) return null;
  return monthBounds(raw) ? raw : null;
}

export default async function AdminCalendarPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const session = await requireAdmin();
  const params = (await searchParams) ?? {};
  const monthIso = pickMonthParam(params.month) ?? churchMonthIso();

  return (
    <>
      <FrozenSurfaceBanner />
      <PlanningView
        monthIso={monthIso}
        viewerId={session.profile.id}
        initialTab="calendar"
      />
    </>
  );
}
