import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import {
  SettingsShell,
  type SettingsShellData,
} from "@/components/admin/settings-shell";
import { requireAdmin } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchAllGroupMetricSettings,
  fetchAllGroups,
  fetchPlatformConfig,
} from "@/lib/supabase/read-models";
import { fetchMetricDefaultsCached } from "@/lib/supabase/cached-config";
import {
  BUILT_IN_METRIC_DEFAULTS,
  decodeMetricDefaults,
} from "@/lib/admin/metrics";
import { decodeAppConfig } from "@/lib/admin/app-config-decode";

export const dynamic = "force-dynamic";

function emptyData(isSuperAdmin: boolean): SettingsShellData {
  return {
    defaults: BUILT_IN_METRIC_DEFAULTS,
    defaultsSource: "fallback",
    groups: [],
    groupMetricSettings: [],
    isSuperAdmin,
    editableCopy: isSuperAdmin ? {} : null,
    errors: {
      defaults: "The database is not configured in this environment.",
      groups: "The database is not configured in this environment.",
      overrides: "The database is not configured in this environment.",
    },
  };
}

async function loadData(isSuperAdmin: boolean): Promise<SettingsShellData> {
  const client = await createSupabaseServerClient();
  if (!client) return emptyData(isSuperAdmin);

  const [defaultsResult, groupsResult, settingsResult, platformConfigResult] =
    await Promise.all([
      fetchMetricDefaultsCached(client),
      fetchAllGroups(client),
      fetchAllGroupMetricSettings(client),
      // platform_config (editable copy) is Super-Admin-only by RLS; only read it
      // for a super_admin so a ministry_admin doesn't trigger a useless query.
      // The General tab surfaces a pointer to the console for ministry admins.
      isSuperAdmin ? fetchPlatformConfig(client) : Promise.resolve(null),
    ]);

  const decoded = decodeMetricDefaults(defaultsResult.data ?? null);

  return {
    defaults: decoded,
    defaultsSource: defaultsResult.data ? "live" : "fallback",
    groups: groupsResult.data ?? [],
    groupMetricSettings: settingsResult.data ?? [],
    isSuperAdmin,
    editableCopy: isSuperAdmin
      ? decodeAppConfig(platformConfigResult?.data ?? null).editableCopy
      : null,
    errors: {
      defaults: defaultsResult.error?.message ?? null,
      groups: groupsResult.error?.message ?? null,
      overrides: settingsResult.error?.message ?? null,
    },
  };
}

export default async function AdminSettingsPage() {
  const session = await requireAdmin();
  const isSuperAdmin = session.profile.role === "super_admin";
  const data = await loadData(isSuperAdmin);

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
