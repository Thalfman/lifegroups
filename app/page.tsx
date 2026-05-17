import Link from "next/link";
import { ActionCard, MetricCard, StatusCard } from "@/components/dashboard/cards";
import { HealthBadge, LifecycleBadge } from "@/components/dashboard/badges";
import { AppShell, SectionHeader } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";
import { DataSourceBadge } from "@/components/dashboard/data-source-badge";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default function HomePage() {
  const source = isSupabaseConfigured() ? "live" : "fallback";
  return (
    <AppShell
      title="Life Group Operations Dashboard"
      subtitle="A warm, focused command center for ministry admins and life group leaders."
      headerSlot={<DataSourceBadge source={source} />}
    >
      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard title="Leader check-ins" value="Weekly" meta="Simple, mobile-first check-in flow" />
        <MetricCard title="Guest follow-up" value="Pipeline" meta="Visibility from new to placed" />
        <MetricCard title="Capacity awareness" value="At a glance" meta="Highlights groups approaching full" />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <StatusCard title="What this preview demonstrates">
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>• Leader check-ins and member checklist flow.</li>
            <li>• Admin visibility into attendance trends and group health.</li>
            <li>• Planned pause handling and restart readiness status.</li>
            <li>• Guest follow-up and capacity-first decisions.</li>
          </ul>
        </StatusCard>
        <ActionCard
          title="Explore preview dashboards"
          description="Phase 3 reads from Supabase when env vars are configured, and falls back to demo data otherwise. No auth, no writes yet."
          action={
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/admin-preview">Open admin preview</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/leader-preview">Open leader preview</Link>
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
