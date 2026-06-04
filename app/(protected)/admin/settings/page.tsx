import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { SettingsShell } from "@/components/admin/settings-shell";
import { loadSettingsData } from "@/components/admin/settings/settings-data";
import { requireAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const session = await requireAdmin();
  const isSuperAdmin = session.profile.role === "super_admin";
  const data = await loadSettingsData(isSuperAdmin);

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Settings"
        italic="& thresholds"
        lede="Set the defaults the dashboard uses to flag warnings, then apply per-group overrides when a group needs its own thresholds."
      />
      <PageBody>
        <SettingsShell data={data} />
      </PageBody>
    </>
  );
}
