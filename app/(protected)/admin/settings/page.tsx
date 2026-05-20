import { PastoralAppShell } from "@/components/pastoral/shell";
import { UserPill } from "@/components/auth/user-pill";
import { LogoutButton } from "@/components/auth/logout-button";
import { SettingsShell, type SettingsShellData } from "@/components/admin/settings-shell";
import { requireAdmin } from "@/lib/auth/session";
import { navItemsForRole } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchAllGroupMetricSettings,
  fetchAllGroups,
  fetchMetricDefaults,
} from "@/lib/supabase/read-models";
import { BUILT_IN_METRIC_DEFAULTS, decodeMetricDefaults } from "@/lib/admin/metrics";

export const dynamic = "force-dynamic";

const EMPTY_DATA: SettingsShellData = {
  defaults: BUILT_IN_METRIC_DEFAULTS,
  defaultsSource: "fallback",
  groups: [],
  groupMetricSettings: [],
  errors: {
    defaults: "Supabase is not configured in this environment.",
    groups: "Supabase is not configured in this environment.",
    overrides: "Supabase is not configured in this environment.",
  },
};

async function loadData(): Promise<SettingsShellData> {
  const client = await createSupabaseServerClient();
  if (!client) return EMPTY_DATA;

  const [defaultsResult, groupsResult, settingsResult] = await Promise.all([
    fetchMetricDefaults(client),
    fetchAllGroups(client),
    fetchAllGroupMetricSettings(client),
  ]);

  const decoded = decodeMetricDefaults(defaultsResult.data ?? null);

  return {
    defaults: decoded,
    defaultsSource: defaultsResult.data ? "live" : "fallback",
    groups: groupsResult.data ?? [],
    groupMetricSettings: settingsResult.data ?? [],
    errors: {
      defaults: defaultsResult.error?.message ?? null,
      groups: groupsResult.error?.message ?? null,
      overrides: settingsResult.error?.message ?? null,
    },
  };
}

export default async function AdminSettingsPage() {
  const session = await requireAdmin();
  const data = await loadData();

  return (
    <PastoralAppShell
      navItems={navItemsForRole(session.profile.role)}
      currentUser={{
        name: session.profile.full_name,
        email: session.profile.email,
        role: session.profile.role,
      }}
      eyebrow="Settings"
      title="Settings"
      lede="Set the defaults the dashboard uses to flag warnings, then apply per-group overrides when a group needs its own thresholds."
      headerSlot={
        <>
          <UserPill
            name={session.profile.full_name}
            email={session.profile.email}
            role={session.profile.role}
          />
          <LogoutButton />
        </>
      }
    >
      <SettingsShell data={data} />
    </PastoralAppShell>
  );
}
