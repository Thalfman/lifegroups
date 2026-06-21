// Hidden from nav (EXT.1 in docs/PRODUCT_ROADMAP.md) per the Julian
// admin OS pivot — anything external lives behind a future scope
// conversation with Julian + the comms director. The route still
// resolves so existing bookmarks work, and the pipeline data is left
// intact. No new work here without an EXT.1 spec. See
// docs/PRODUCT_SURFACE_AUDIT_2026-05.md.
//
// Wired through the admin page runner (ADR 0028); the frozen-surface banner is
// the runner's `frozenBanner`.
//
// Kept off-nav by design — keep/retire/re-export decision: Keep (ADR 0033). The
// only Prospect/Interest-Funnel surface that exists; preserved pending a future
// canonical funnel.
import { PageBody } from "@/components/lg/PageHeader";
import { GuestsManagementShell } from "@/components/admin/guests/guests-shell";
import { loadGuestsData } from "@/components/admin/guests/guests-data";
import { adminPage } from "@/lib/admin/admin-page";
import { isSuperAdminRole } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

export default adminPage({
  frozenBanner: true,
  load: async (_params, session) => ({
    data: await loadGuestsData(),
    isSuperAdmin: isSuperAdminRole(session.profile.role),
  }),
  header: () => ({
    eyebrow: "Guests",
    title: "Guests",
    italic: "& invitations",
    lede: "Add a guest, walk them through the pipeline, and assign a follow-up owner. Nothing here sends an SMS or email — this is your manual record.",
  }),
  render: ({ data, isSuperAdmin }) => (
    <PageBody>
      <GuestsManagementShell data={data} isSuperAdmin={isSuperAdmin} />
    </PageBody>
  ),
});
