import { LifecycleBadge } from "@/components/dashboard/lifecycle-badge";
import { HealthBadge } from "@/components/dashboard/health-badge";
import { EmptyState } from "@/components/dashboard/empty-state";
import { LoadingSkeleton } from "@/components/dashboard/loading-skeleton";
import { MetricCard, StatusCard } from "@/components/dashboard/cards";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";

export default function AdminPreviewPage() {
  return (
    <AppShell title="Admin Preview" subtitle="Future ministry-wide visibility">
      <PageHeader title="Ministry Snapshot" description="Static sample content that previews the planned admin dashboard experience." />
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Active Groups" value="28" note="2 groups in restart planning" />
        <MetricCard title="Weekly Attendance" value="362" note="+4.1% from previous week" />
        <MetricCard title="Guest Follow-ups" value="14" note="6 due in next 48 hours" />
        <MetricCard title="Leader Check-ins" value="22/28" note="78% submitted" />
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <StatusCard title="Group Health" status={<HealthBadge value="Watch" />}>
          <p className="text-sm text-muted-foreground">Three groups show declining consistency. Coaching reminders and support plans are queued.</p>
        </StatusCard>
        <StatusCard title="Lifecycle Mix" status={<LifecycleBadge value="Planned Pause" />}>
          <p className="text-sm text-muted-foreground">Four groups are entering summer pauses with restart dates already scheduled.</p>
        </StatusCard>
      </section>
      <section className="grid gap-4 lg:grid-cols-3">
        <LoadingSkeleton />
        <EmptyState title="Attendance Trend Placeholder" description="Weekly attendance charts will be enabled in a later phase when real check-ins are available." />
        <EmptyState title="Guest Pipeline Placeholder" description="Future stages: first visit, contacted, connected, and integrated." />
      </section>
      <EmptyState title="Planned Pause" description="Upcoming pause planning area with restart readiness indicators and leader support tasks." />
    </AppShell>
  );
}
