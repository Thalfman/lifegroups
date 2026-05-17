import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PHASE_5A_1_GATE_COPY } from "@/components/admin/phase-gate-notice";

export function DisabledAdminActionCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{description}</p>
        <Button
          variant="outline"
          disabled
          aria-disabled="true"
          title={PHASE_5A_1_GATE_COPY}
          className="cursor-not-allowed opacity-60"
        >
          Coming in Phase 5A.1
        </Button>
        <p className="text-xs text-muted-foreground">{PHASE_5A_1_GATE_COPY}</p>
      </CardContent>
    </Card>
  );
}
