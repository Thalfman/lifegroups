import { ActionCard, StatusCard } from "@/components/dashboard/cards";
import { HealthBadge } from "@/components/dashboard/badges";
import { AppShell, SectionHeader } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

const members = ["Jordan K.", "Priya M.", "Noah B.", "Grace T.", "Elijah R."];

export default function LeaderPreviewPage() {
  return (
    <AppShell title="Leader Workflow Preview" subtitle="A simple weekly check-in flow designed for clarity on mobile and desktop.">
      <section className="grid gap-4 lg:grid-cols-2">
        <ActionCard title="This week's check-in" description="Tuesday Night Life Group · Week of May 17" action={<div className="flex gap-2"><Button>Submit check-in</Button><Button variant="outline">Did not meet</Button></div>} />
        <StatusCard title="Quick group pulse"><div className="space-y-2 text-sm text-muted-foreground"><p>Attendance rhythm: steady</p><p>New guest this week: 1</p><p className="flex items-center gap-2">Current health: <HealthBadge tone="healthy" label="Healthy" /></p></div></StatusCard>
      </section>

      <section className="space-y-4">
        <SectionHeader title="Member checklist preview" description="Leaders will eventually tap names to mark present and submit attendance." />
        <ul className="surface-subtle space-y-2 p-4">{members.map((member) => <li key={member} className="flex items-center justify-between rounded-md bg-background px-3 py-2 text-sm"><span>{member}</span><button className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"><Check className="h-3.5 w-3.5" />Present</button></li>)}</ul>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <ActionCard title="Add guest" description="Capture a guest name and mark if follow-up is requested. Static preview only in Phase 1." action={<Button variant="outline">Add guest</Button>} />
        <StatusCard title="Next actions"><ul className="space-y-2 text-sm text-muted-foreground"><li>• Confirm attendance and submit.</li><li>• Add first-time guests.</li><li>• Mark group pulse before closing check-in.</li></ul></StatusCard>
      </section>
    </AppShell>
  );
}
