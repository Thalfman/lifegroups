import Link from "next/link";
import { ActionCard, MetricCard, StatusCard } from "@/components/dashboard/cards";
import { HealthBadge, LifecycleBadge } from "@/components/dashboard/badges";
import { AppShell, SectionHeader } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";
import { getCurrentSession } from "@/lib/auth/session";
import { defaultLandingPathForRole, ROLE_LABELS } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getCurrentSession();
  const signedIn = !!session?.profile;
  const landingPath = session?.profile
    ? defaultLandingPathForRole(session.profile.role)
    : null;

  return (
    <AppShell
      title="Life Group Operations Dashboard"
      subtitle="A warm, focused command center for ministry admins and life group leaders."
      headerSlot={
        signedIn && session?.profile ? (
          <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
            Signed in as {session.profile.full_name} · {ROLE_LABELS[session.profile.role]}
          </span>
        ) : (
          <Button asChild>
            <Link href="/login">Sign in</Link>
          </Button>
        )
      }
    >
      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard title="Leader check-ins" value="Weekly" meta="Simple, mobile-first check-in flow" />
        <MetricCard title="Guest follow-up" value="Pipeline" meta="Visibility from new to placed" />
        <MetricCard title="Capacity awareness" value="At a glance" meta="Highlights groups approaching full" />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <StatusCard title="What this app delivers">
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>• Leader check-ins and member roster visibility.</li>
            <li>• Admin visibility into attendance trends and group health.</li>
            <li>• Planned pause handling and restart readiness status.</li>
            <li>• Guest follow-up and capacity-first decisions.</li>
          </ul>
        </StatusCard>
        <ActionCard
          title={signedIn ? "Open your dashboard" : "Sign in to see live data"}
          description={
            signedIn
              ? "Your dashboard is scoped by Row Level Security to the data your role can see."
              : "Phase 4 adds Supabase Auth, role-aware dashboards, and Row Level Security. Without sign-in, only the public design previews are visible."
          }
          action={
            <div className="flex flex-wrap gap-2">
              {signedIn && landingPath ? (
                <Button asChild>
                  <Link href={landingPath}>Open my dashboard</Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/login">Sign in</Link>
                </Button>
              )}
              <Button asChild variant="outline">
                <Link href="/admin-preview">Admin design preview</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/leader-preview">Leader design preview</Link>
              </Button>
            </div>
          }
        />
      </section>

      <section className="space-y-4">
        <SectionHeader
          title="Shared status language"
          description="Reusable lifecycle and health badges so admin and leader views stay consistent."
        />
        <div className="flex flex-wrap gap-2">
          <LifecycleBadge status="Active" />
          <LifecycleBadge status="Planned Pause" />
          <LifecycleBadge status="Seasonal Break" />
          <LifecycleBadge status="Restart Soon" />
          <LifecycleBadge status="Overdue Restart" />
          <HealthBadge tone="healthy" label="Healthy" />
          <HealthBadge tone="watch" label="Watch" />
          <HealthBadge tone="followup" label="Needs Follow-up" />
        </div>
      </section>
    </AppShell>
  );
}
