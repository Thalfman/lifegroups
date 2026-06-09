import {
  CarePageView,
  type CareSearchParams,
} from "@/app/(protected)/admin/care/page";

// /admin/shepherd-care is a thin alias entry to the canonical Care surface
// (/admin/care). It ALIAS-RENDERS — returns 200, never a 302 — the same Care
// shell on the SAME default tab as /admin/care (the Over-Shepherd accordion,
// #373), so the experience is identical regardless of which URL resolved it
// (ADR 0013, #328). The landing page owns no view of its own, so it re-renders
// CarePageView with no tab override and inherits the canonical default. The
// admin guard runs in CarePageView via loadCarePageData(); there is one loader
// and one shell, so no data path or component is duplicated. The
// /admin/shepherd-care/[profileId] detail and /admin/shepherd-care/over-shepherds
// sub-paths are untouched and still resolve on their own surfaces.
//
// The embedded Dashboard widgets still drill down via the legacy
// `?view=directory` / `?coverage=…` params against THIS path, so forward
// searchParams: CarePageView translates them into the matching Directory /
// Coverage tab (#334), keeping the deep links live without breaking the
// alias-render-200 contract.
export const dynamic = "force-dynamic";

export default async function AdminShepherdCarePage({
  searchParams,
}: {
  searchParams?: Promise<CareSearchParams>;
}) {
  return <CarePageView searchParams={searchParams} />;
}
