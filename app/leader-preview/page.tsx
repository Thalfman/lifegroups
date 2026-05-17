import { ActionCard, MetricCard, StatusCard } from "@/components/dashboard/cards";
import { HealthBadge } from "@/components/dashboard/health-badge";
import { EmptyState } from "@/components/dashboard/empty-state";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";

export default function LeaderPreviewPage() {
  return (
    <AppShell title="Leader Preview" subtitle="Simple weekly check-in flow">
      <PageHeader title="This Week's Check-in" description="Preview of leader-first workflows with static demo content." action={<Button>Submit Check-in</Button>} />
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Members Present" value="12" note="Out of 15 regular members" />
        <MetricCard title="Guests" value="2" note="Both first-time guests" />
        <MetricCard title="Prayer Needs" value="5" note="2 marked urgent" />
        <MetricCard title="Group Status" value="Active" note="Meeting as scheduled" />
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <StatusCard title="Member Checklist Preview" status={<HealthBadge value="Healthy" />}>
          <ul className="list-inside list-disc text-sm text-muted-foreground">
            <li>Attendance captured</li>
            <li>Guests welcomed and noted</li>
            <li>Follow-up owner assigned</li>
          </ul>
        </StatusCard>
        <ActionCard title="Add Guest" description="Quick action to capture first-time and returning guest details.">
          <Button variant="outline" className="w-full sm:w-auto">Open Guest Form</Button>
        </ActionCard>
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <ActionCard title="Did Not Meet" description="Use when your group did not meet this week. Add a brief reason and send update.">
          <Button variant="secondary" className="w-full sm:w-auto">Mark Did Not Meet</Button>
        </ActionCard>
        <EmptyState title="Follow-up Queue Placeholder" description="Upcoming queue for member care actions, celebration notes, and pastoral escalations." />
      </section>
    </AppShell>
  );
}
