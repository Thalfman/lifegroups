import { requireAdmin } from "@/lib/auth/session";
import { FrozenSurfaceBanner } from "@/components/lg/FrozenSurfaceBanner";
import { PlanningView } from "@/components/admin/planning/planning-view";
import { pickMonthParam } from "@/lib/calendar/month-param";
import { churchMonthIso } from "@/lib/shared/church-time";

// Planning area (ADR 0013, #303). Planning is the entry point for Job 2 — "what
// groups need to launch / what is coming next?" — and hosts the former Launch
// Planning + Calendar surfaces as the five tabs Calendar, Launches, Capacity,
// Scenarios, Multiplication. The page chrome + loader + shell live in the shared
// PlanningView (#329); the frozen /admin/launch-planning and /admin/calendar
// aliases render the same view at a different initial tab (alias-render, 200 —
// never a 302), so the three entries share ONE loader path and can't drift. This
// canonical route defaults to its first view, Calendar.
//
// Kept off-nav by design — keep/retire/re-export decision: Keep (ADR 0033).
export const dynamic = "force-dynamic";

type SearchParams = { month?: string | string[] };

export default async function AdminPlanningPage({
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
        // Canonical Planning entry owns the #331 opinionated saved views; the
        // frozen /admin/calendar alias does NOT pass this, so it keeps its
        // pre-#331 calendar behavior (ADR 0013 freeze).
        planningViews
      />
    </>
  );
}
