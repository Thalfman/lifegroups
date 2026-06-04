import { CarePageView } from "@/app/(protected)/admin/care/page";

// /admin/shepherd-care is a thin alias entry to the canonical Care surface
// (/admin/care). It ALIAS-RENDERS — returns 200, never a 302 — the same Care
// shell, opened on the Dashboard tab (ADR 0013, #328; re-keyed in #334 — the
// former Needs Contact landing now lives inside the Dashboard's attention
// queue). The admin guard runs in CarePageView via loadCarePageData(); there is
// one loader and one shell, so no data path or component is duplicated. The
// /admin/shepherd-care/[profileId] detail and /admin/shepherd-care/over-shepherds
// sub-paths are untouched and still resolve on their own surfaces.
export const dynamic = "force-dynamic";

export default async function AdminShepherdCarePage() {
  return <CarePageView initialTab="dashboard" />;
}
