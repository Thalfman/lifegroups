import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { SettingsShell } from "@/components/admin/settings-shell";
import { loadSettingsData } from "@/components/admin/settings/settings-data";
import { requireAdmin } from "@/lib/auth/session";
import { firstParam } from "@/lib/shared/search-params";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage({
  searchParams,
}: {
  // `?tab=` deep-links a specific tab (e.g. from the Multiply page's CTAs, or
  // the /admin/multiply/settings|criteria aliases). Unknown values fall back to
  // the default tab in SettingsTabs.
  searchParams?: Promise<{ tab?: string | string[] }>;
}) {
  const session = await requireAdmin();
  const isSuperAdmin = session.profile.role === "super_admin";
  const data = await loadSettingsData(isSuperAdmin);

  const tabRaw = (await searchParams)?.tab;
  const initialTabId = firstParam(tabRaw);

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Settings"
        lede="Configure what drives Care and Multiply — the health rubrics, pastoral wording, and the per-type multiplication pillars. Dashboard thresholds and system utilities live here too."
      />
      <PageBody>
        <SettingsShell data={data} initialTabId={initialTabId} />
      </PageBody>
    </>
  );
}
