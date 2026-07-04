import { requireAdmin } from "@/lib/auth/session";
import { FrozenSurfaceBanner } from "@/components/lg/FrozenSurfaceBanner";
import { PlanningView } from "@/components/admin/planning/planning-view";
import { pickMonthParam } from "@/lib/calendar/month-param";
import { churchMonthIso } from "@/lib/shared/church-time";

// Frozen /admin/calendar alias (ADR 0013, #329). This is a THIN entry to the
// canonical Planning shell: it renders the shared PlanningView at the Calendar
// tab. Alias-render — a 200 at the matching tab, never a 302 redirect — so the
// surface keeps its own URL but shares ONE loader + shell (and the same master
// calendar data path, via PlanningCalendarPanel) with the canonical
// /admin/planning route. The sidebar marks Planning active for this URL via the
// alias→canonical map (#321).
//
// Kept off-nav by design — keep/retire/re-export decision: Keep (ADR 0033).
// Deliberately NOT on the adminPage() runner (ADR 0028): the shared
// PlanningView owns the page chrome — there is no PageHeader for the runner's
// header slot to render.
export const dynamic = "force-dynamic";

type SearchParams = { month?: string | string[] };

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
