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
        lede="Configure what drives Care and Multiply — the health rubrics, pastoral wording, and the per-type multiplication pillars. Dashboard thresholds and system utilities live here too."
      />
      <PageBody>
        <SettingsShell data={data} />
      </PageBody>
    </>
  );
}
