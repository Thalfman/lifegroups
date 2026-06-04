import { CarePageView } from "@/app/(protected)/admin/care/page";

// /admin/follow-ups is a thin alias entry to the canonical Care surface
// (/admin/care). It ALIAS-RENDERS — returns 200, never a 302 — the same Care
// shell, opened on the Follow-ups tab (ADR 0013, #328). The admin guard runs in
// CarePageView via loadCarePageData(); there is one loader and one shell, so no
// data path or component is duplicated. The /admin/follow-ups path stays
// directly resolvable.
export const dynamic = "force-dynamic";

export default async function AdminFollowUpsPage() {
  return <CarePageView initialTab="follow-ups" />;
}
