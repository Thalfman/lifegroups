import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import {
  SuperAdminConsoleShell,
  type SuperAdminTestAccountsSummary,
} from "@/components/admin/super-admin-console-shell";
import { loadSuperAdminConsoleData } from "@/components/admin/super-admin/console-data";
import { TestAccountsPanel } from "@/components/admin/test-accounts-panel";
import { requireSuperAdmin } from "@/lib/auth/session";
import { testAccountsStatus } from "./test-accounts-actions";

export const dynamic = "force-dynamic";

// Wider than the 1240 shell default so the console doesn't strand hundreds of
// px beside the sidebar on 1440/1920 screens (#449). This page only — other
// admin pages keep the default.
const CONSOLE_MAX_WIDTH = 1520;

function buildTestAccountsSummary(
  result: Awaited<ReturnType<typeof testAccountsStatus>>
): SuperAdminTestAccountsSummary {
  if (!result.ok) {
    return {
      label: "Unknown",
      tone: "warning",
      description:
        result.errors[0] ??
        "Test account status could not be loaded from the existing Edge Function.",
    };
  }

  if (!result.value.ok) {
    return {
      label: "Blocked",
      tone: "blocked",
      description:
        result.value.errors[0] ??
        "The test account Edge Function returned a blocked status.",
    };
  }

  if (result.value.enabledOverall) {
    return {
      label: "Active",
      tone: "warning",
      description:
        "Known-password test accounts are active. Keep them visible for testing and disable them before launch.",
    };
  }

  return {
    label: "Disabled",
    tone: "good",
    description:
      "Known test accounts are not currently enabled according to the existing Edge Function status.",
  };
}

export default async function AdminSuperAdminPage() {
  const session = await requireSuperAdmin();
  const data = await loadSuperAdminConsoleData(session.profile.id);
  const initialTestAccounts = await testAccountsStatus();
  const testAccountsSummary = buildTestAccountsSummary(initialTestAccounts);

  return (
    <>
      <PageHeader
        eyebrow="Super admin"
        title="Super Admin"
        lede="Owner and operator console for launch readiness, access, configuration, diagnostics, audit, and guarded danger actions."
        maxWidth={CONSOLE_MAX_WIDTH}
      />
      {/* ADR 0027: the setup "Import people" deep-link lands deep in the
          console (the People-import panel, via #people-import); the return
          affordance renders AT that panel (SetupReturnBanner), not page-top,
          since the hash handler scrolls past anything up here. */}
      <PageBody maxWidth={CONSOLE_MAX_WIDTH}>
        <SuperAdminConsoleShell
          data={data}
          testAccountsSummary={testAccountsSummary}
          testAccountsPanel={
            <TestAccountsPanel
              initialStatus={
                initialTestAccounts.ok ? initialTestAccounts.value : null
              }
              initialErrors={
                initialTestAccounts.ok ? [] : initialTestAccounts.errors
              }
            />
          }
        />
      </PageBody>
    </>
  );
}
