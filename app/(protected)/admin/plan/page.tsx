import { requireAdmin } from "@/lib/auth/session";
import { AreaPlaceholder } from "@/components/admin/area-placeholder";

// Plan area (ADR 0016, #372). Plan is the Interest Funnel — Prospects moving
// Interested → Matched → Joined (or parked Not at this time) with a single Next
// Step and an armed follow-up. It supersedes the former Guests pipeline, whose
// frozen /admin/guests route stays a direct-URL alias (NAV_ALIAS_TO_CANONICAL
// marks Plan active for it). This slice ships only the nav entry + a minimal
// "being built" shell; the funnel itself lands in #375.
export const dynamic = "force-dynamic";

export default async function AdminPlanPage() {
  await requireAdmin();
  return (
    <AreaPlaceholder
      eyebrow="Plan"
      title="The interest"
      italic="funnel"
      lede="Where people interested in joining a group move from first interest to a real group."
      building="The Interest Funnel is being built here — Prospects, their state on the board, a single next step, and armed follow-ups. The existing guest pipeline still lives at /admin/guests in the meantime."
    />
  );
}
