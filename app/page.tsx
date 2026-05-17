import Link from "next/link";
import { ActionCard, MetricCard, StatusCard } from "@/components/dashboard/cards";
import { HealthBadge, LifecycleBadge } from "@/components/dashboard/badges";
import { AppShell, SectionHeader } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <AppShell title="Life Group Operations Dashboard" subtitle="A warm, focused command center preview for ministry admins and life group leaders.">
      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard title="Leader check-ins" value="34 / 40" meta="Simple weekly workflow in leader preview" />
        <MetricCard title="Guest follow-up" value="12 pending" meta="Pipeline visibility for ministry admin" />
        <MetricCard title="Capacity awareness" value="81%" meta="Highlights groups approaching full capacity" />
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
          description="Static sample content only—no auth, no Supabase runtime integration, and no live attendance submission in this phase."
          action={<div className="flex flex-wrap gap-2"><Button asChild><Link href="/admin-preview">Open admin preview</Link></Button><Button asChild variant="outline"><Link href="/leader-preview">Open leader preview</Link></Button></div>}
        />
      </section>

      <section className="space-y-4">
        <SectionHeader title="Shared status language" description="Phase 1 introduces reusable badge styling that future dashboards can reuse." />
        <div className="flex flex-wrap gap-2">
          <LifecycleBadge status="Active" /><LifecycleBadge status="Planned Pause" /><LifecycleBadge status="Seasonal Break" /><LifecycleBadge status="Restart Soon" /><LifecycleBadge status="Overdue Restart" />
          <HealthBadge tone="healthy" label="Healthy" /><HealthBadge tone="watch" label="Watch" /><HealthBadge tone="followup" label="Needs Follow-up" />
        </div>
      </section>
    </AppShell>
  );
}
