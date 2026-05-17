import { EmptyState, LoadingSkeleton, MetricCard, StatusCard } from "@/components/dashboard/cards";
import { HealthBadge, LifecycleBadge } from "@/components/dashboard/badges";
import { AppShell, SectionHeader } from "@/components/layout/shell";

export default function AdminPreviewPage() {
  return (
    <AppShell title="Admin Dashboard Preview" subtitle="Future ministry-level visibility with lightweight static sample content.">
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Active groups" value="18" meta="2 planned pauses this month" />
        <MetricCard title="Attendance this week" value="312" meta="+6% from prior week" />
        <MetricCard title="Guests in pipeline" value="23" meta="8 need placement" />
        <MetricCard title="Missing check-ins" value="4" meta="Action queue for Monday follow-up" />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <StatusCard title="Active group health">
          <div className="space-y-3 text-sm">
            <p className="flex items-center justify-between">Northside Young Adults <span className="flex gap-2"><LifecycleBadge status="Active" /><HealthBadge tone="healthy" label="Healthy" /></span></p>
            <p className="flex items-center justify-between">Eastside Families <span className="flex gap-2"><LifecycleBadge status="Planned Pause" /><HealthBadge tone="watch" label="Watch" /></span></p>
            <p className="flex items-center justify-between">Downtown Men <span className="flex gap-2"><LifecycleBadge status="Restart Soon" /><HealthBadge tone="followup" label="Needs Follow-up" /></span></p>
          </div>
        </StatusCard>
        <StatusCard title="Capacity overview">
          <div className="space-y-2 text-sm text-muted-foreground"><p>4 groups near full capacity.</p><p>2 groups marked <strong className="text-foreground">Capacity Full</strong>.</p><p>3 guests waiting on placement recommendations.</p></div>
        </StatusCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <StatusCard title="Attendance trend"><LoadingSkeleton className="h-36" /></StatusCard>
        <StatusCard title="Guest pipeline"><EmptyState title="Pipeline visualization in Phase 3" description="Static placeholder for now; future chart and queue modules will connect to Supabase." /></StatusCard>
        <StatusCard title="Follow-up queue"><EmptyState title="Weekly queue placeholder" description="Includes guest follow-up and missed check-in flows in future data-connected phase." /></StatusCard>
      </section>

      <section className="space-y-4">
        <SectionHeader title="Planned pauses and restart readiness" description="Preview of lifecycle-focused oversight across all ministry groups." />
        <div className="surface-subtle p-4 text-sm text-muted-foreground">Groups in <strong className="text-foreground">Seasonal Break</strong> remain visible to support restart planning and leader touchpoints.</div>
      </section>
    </AppShell>
  );
}
