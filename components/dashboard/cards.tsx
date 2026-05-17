import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function MetricCard({ title, value, note }: { title: string; value: string; note?: string }) {
  return (
    <Card className="app-surface"><CardHeader><CardTitle className="text-sm text-muted-foreground">{title}</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold">{value}</p>{note ? <p className="text-xs text-muted-foreground">{note}</p> : null}</CardContent></Card>
  );
}

export function StatusCard({ title, status, children }: { title: string; status: ReactNode; children: ReactNode }) {
  return (
    <Card className="app-surface"><CardHeader className="flex-row items-center justify-between"><CardTitle className="text-base">{title}</CardTitle>{status}</CardHeader><CardContent>{children}</CardContent></Card>
  );
}

export function ActionCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <Card className="app-surface"><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">{description}</p>{children}</CardContent></Card>
  );
}
