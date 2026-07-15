import { Suspense } from "react";
import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { PageSkeleton } from "@/components/lg/PageSkeleton";
import {
  SuperAdminConsoleShell,
  type SuperAdminTestAccountsSummary,
} from "@/components/admin/super-admin-console-shell";
import { loadSuperAdminConsoleData } from "@/components/admin/super-admin/console-data";
import { TestAccountsPanel } from "@/components/admin/test-accounts-panel";
import { requireSuperAdmin } from "@/lib/auth/session";
import { measureReadBundle } from "@/lib/observability/read-timing";
import { testAccountsStatus } from "./test-accounts-actions";
import {
  resolveSuperAdminWorkspaceId,
  type SuperAdminWorkspaceId,
} from "@/lib/admin/super-admin-console-model";

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

export default async function AdminSuperAdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ workspace?: string | string[] }>;
}) {
  // Guard and tab resolution stay outside the Suspense boundary (both are
  // cheap, and redirect() must not fire from inside a streamed body); the
  // console's read fan-out streams behind it (#900) so the header flushes
  // immediately instead of waiting on up to 14 reads for the danger workspace.
  const session = await requireSuperAdmin();
  const activeWorkspaceId = resolveSuperAdminWorkspaceId(
    (await searchParams)?.workspace
  );

  return (
    <>
      <PageHeader
        eyebrow="Super admin"
        title="Super Admin"
        lede="Owner and operator console for launch readiness, access, configuration, diagnostics, audit, usage, and guarded danger actions."
        maxWidth={CONSOLE_MAX_WIDTH}
      />
      <Suspense fallback={<PageSkeleton bodyOnly />}>
        <ConsoleBody
          profileId={session.profile.id}
          activeWorkspaceId={activeWorkspaceId}
        />
      </Suspense>
    </>
  );
}

async function ConsoleBody({
  profileId,
  activeWorkspaceId,
}: {
  profileId: string;
  activeWorkspaceId: SuperAdminWorkspaceId;
}) {
  const loadTestAccounts =
    activeWorkspaceId === "readiness" || activeWorkspaceId === "diagnostics";
  // Timed so the production `read_bundle` logs attribute this surface's read
  // latency (the signal #900's streaming split is measured by); `describe`
  // carries only the workspace id and an error count — never data.
  const [data, initialTestAccounts] = await measureReadBundle(
    "super_admin_console",
    () =>
      Promise.all([
        loadSuperAdminConsoleData(profileId, activeWorkspaceId),
        loadTestAccounts ? testAccountsStatus() : Promise.resolve(null),
      ]),
    ([consoleData]) => ({
      workspace: activeWorkspaceId,
      error_count: Object.values(consoleData.errors).filter(Boolean).length,
    })
  );
  const testAccountsSummary = initialTestAccounts
    ? buildTestAccountsSummary(initialTestAccounts)
    : {
        label: "Not loaded",
        tone: "planned" as const,
        description:
          "Test-account status loads only in Readiness and Diagnostics.",
      };
  const testAccountsPanel = initialTestAccounts ? (
    <TestAccountsPanel
      initialStatus={initialTestAccounts.ok ? initialTestAccounts.value : null}
      initialErrors={initialTestAccounts.ok ? [] : initialTestAccounts.errors}
    />
  ) : null;

  return (
    /* ADR 0027: the setup "Import people" deep-link lands deep in the
        console (the People-import panel, via #people-import); the return
        affordance renders AT that panel (SetupReturnBanner), not page-top,
        since the hash handler scrolls past anything up here. */
    <PageBody maxWidth={CONSOLE_MAX_WIDTH}>
      <SuperAdminConsoleShell
        data={data}
        activeWorkspaceId={activeWorkspaceId}
        testAccountsSummary={testAccountsSummary}
        testAccountsPanel={testAccountsPanel}
      />
    </PageBody>
  );
}
