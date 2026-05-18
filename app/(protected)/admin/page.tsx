import { PastoralAppShell } from "@/components/pastoral/shell";
import { AdminDashboard } from "@/components/dashboard/admin-dashboard";
import { DataSourceBadge } from "@/components/dashboard/data-source-badge";
import {
  ConfiguredDataNotice,
  DashboardErrorNotice,
  FallbackDataNotice,
} from "@/components/dashboard/notices";
import { UserPill } from "@/components/auth/user-pill";
import { LogoutButton } from "@/components/auth/logout-button";
import { PButton } from "@/components/pastoral/button";
import { P, fontBody } from "@/lib/pastoral";
import { requireAdmin } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAdminDashboardData } from "@/lib/dashboard/queries";
import { navItemsForRole } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

function greetingName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0];
  return first ? `${first}.` : `${fullName}.`;
}

function missingCheckInsLede(data: { missingCheckInsCount: number }): string {
  if (data.missingCheckInsCount === 0) {
    return "Every group has checked in for the week. Quiet stretch.";
  }
  const plural = data.missingCheckInsCount === 1 ? "group hasn't" : "groups haven't";
  return `${data.missingCheckInsCount} ${plural} checked in yet. A gentle nudge goes out tonight unless you intervene.`;
}

export default async function AdminPage() {
  const session = await requireAdmin();
  const client = await createSupabaseServerClient();
  const { source, data, error } = await getAdminDashboardData(client);

  return (
    <PastoralAppShell
      navItems={navItemsForRole(session.profile.role)}
      eyebrow={`${data.weekLabel} · Admin`}
      title="Good morning,"
      titleItalic={greetingName(session.profile.full_name)}
      lede={missingCheckInsLede(data)}
      actions={
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 8,
          }}
        >
          <div
            id="admin-actions-help"
            aria-live="polite"
            style={{
              fontFamily: fontBody,
              fontSize: 12,
              color: P.ink3,
              fontStyle: "italic",
              textAlign: "right",
              maxWidth: 280,
              lineHeight: 1.45,
            }}
          >
            Export and nudge workflows arrive in Phase 5B with operational
            writes.
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <PButton
              tone="ghost"
              disabled
              aria-describedby="admin-actions-help"
            >
              Export week
            </PButton>
            <PButton
              tone="solid"
              disabled
              aria-describedby="admin-actions-help"
            >
              Send nudges
            </PButton>
          </div>
        </div>
      }
      headerSlot={
        <>
          <DataSourceBadge source={source} />
          <UserPill
            name={session.profile.full_name}
            email={session.profile.email}
            role={session.profile.role}
          />
          <LogoutButton />
        </>
      }
    >
      <div style={{ display: "grid", gap: 14 }}>
        {source === "live" ? <ConfiguredDataNotice /> : <FallbackDataNotice />}
        {error ? <DashboardErrorNotice message={error} /> : null}
        <AdminDashboard data={data} />
      </div>
    </PastoralAppShell>
  );
}
