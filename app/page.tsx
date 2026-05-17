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
      subtitle="A ministry command center: admin visibility into group health, a weekly leader workflow, guest follow-up, and capacity-aware decisions — all in one place."
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
        <MetricCard
          title="Leader workflow"
          value="Weekly"
          meta="Mobile-first check-ins, roster, and group pulse"
        />
        <MetricCard
          title="Guest follow-up"
          value="Pipeline"
          meta="Track every guest from first visit to placed"
        />
        <MetricCard
          title="Capacity awareness"
          value="At a glance"
          meta="Spot near-full groups before they overflow"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <StatusCard title="What this app delivers">
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>• A ministry command center for admins and life group leaders.</li>
            <li>• Admin visibility into attendance trends, group health, and follow-up load.</li>
            <li>• A simple weekly workflow for leaders: roster, pulse, and check-in.</li>
            <li>• Guest follow-up from first visit through placement in a group.</li>
            <li>• Capacity awareness so planned pauses and restarts stay on the radar.</li>
          </ul>
        </StatusCard>
        <ActionCard
          title={signedIn ? "Open your dashboard" : "Sign in to see live data"}
          description={
            signedIn
              ? "Your dashboard is scoped by your role and protected by Row Level Security."
              : "Sign in to see live data scoped to your role. The admin and leader design previews below stay public and use demo data."
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
