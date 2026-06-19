import { PageBody } from "@/components/lg/PageHeader";
import { SettingsShell } from "@/components/admin/settings-shell";
import { loadSettingsData } from "@/components/admin/settings/settings-data";
import { adminPage } from "@/lib/admin/admin-page";
import { firstParam } from "@/lib/shared/search-params";

// Wired through the admin page runner (ADR 0028). `?tab=` deep-links a specific
// tab (e.g. from the Multiply page's CTAs, or the /admin/multiply/settings|
// criteria aliases). Unknown values fall back to the default tab in SettingsTabs.
export const dynamic = "force-dynamic";

export default adminPage({
  params: (raw) => ({ initialTabId: firstParam(raw.searchParams.tab) }),
  load: async (_params, session) => {
    const isSuperAdmin = session.profile.role === "super_admin";
    return { data: await loadSettingsData(isSuperAdmin) };
  },
  header: () => ({
    eyebrow: "Settings",
    title: "Settings",
    lede: "Configure what drives Care and Multiply — the health rubrics, pastoral wording, and the per-type multiplication pillars. Dashboard thresholds and system utilities live here too.",
  }),
  render: ({ data }, { initialTabId }) => (
    <PageBody>
      <SettingsShell data={data} initialTabId={initialTabId} />
    </PageBody>
  ),
});
