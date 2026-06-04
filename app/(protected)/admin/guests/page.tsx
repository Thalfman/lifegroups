// Hidden from nav (EXT.1 in docs/PRODUCT_ROADMAP.md) per the Julian
// admin OS pivot — anything external lives behind a future scope
// conversation with Julian + the comms director. The route still
// resolves so existing bookmarks work, and the pipeline data is left
// intact. No new work here without an EXT.1 spec. See
// docs/PRODUCT_SURFACE_AUDIT_2026-05.md.
import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { GuestsManagementShell } from "@/components/admin/guests/guests-shell";
import { loadGuestsData } from "@/components/admin/guests/guests-data";
import { requireAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminGuestsPage() {
  await requireAdmin();
  const data = await loadGuestsData();

  return (
    <>
      <PageHeader
        eyebrow="Guests"
        title="Guests"
        italic="& invitations"
        lede="Add a guest, walk them through the pipeline, and assign a follow-up owner. Nothing here sends an SMS or email — this is your manual record."
      />
      <PageBody>
        <GuestsManagementShell data={data} />
      </PageBody>
    </>
  );
}
