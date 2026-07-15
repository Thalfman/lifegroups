import { requireAdmin } from "@/lib/auth/session";
import { FrozenSurfaceBanner } from "@/components/lg/FrozenSurfaceBanner";
import { movedToFor } from "@/lib/nav/route-registry";
import { PlanningView } from "@/components/admin/planning/planning-view";
import { pickMonthParam } from "@/lib/calendar/month-param";
import { churchMonthIso } from "@/lib/shared/church-time";

// Frozen /admin/launch-planning alias (ADR 0013, #329). This is a THIN entry to
// the canonical Planning shell: it renders the shared PlanningView at the
// Launches tab. Alias-render — a 200 at the matching tab, never a 302 redirect —
// so the surface keeps its own URL but shares ONE loader + shell with the
// canonical /admin/planning route. The sidebar marks Planning active for this
// URL via the alias→canonical map (#321).
//
// Kept off-nav by design — keep/retire/re-export decision: Keep (ADR 0033).
// Deliberately NOT on the adminPage() runner (ADR 0028): the shared
// PlanningView owns the page chrome — there is no PageHeader for the runner's
// header slot to render.
export const dynamic = "force-dynamic";

type SearchParams = { month?: string | string[] };

export default async function AdminLaunchPlanningPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const session = await requireAdmin();
  const params = (await searchParams) ?? {};
  const monthIso = pickMonthParam(params.month) ?? churchMonthIso();

  return (
    <>
      <FrozenSurfaceBanner
        movedTo={movedToFor("/admin/launch-planning") ?? undefined}
      />
      <PlanningView
        monthIso={monthIso}
        viewerId={session.profile.id}
        initialTab="launches"
      />
    </>
  );
}
