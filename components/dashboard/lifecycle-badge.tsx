import { Badge } from "@/components/ui/badge";

type Lifecycle = "Active" | "Planned Pause" | "Healthy, Paused" | "Restart Soon";

const classes: Record<Lifecycle, string> = {
  Active: "bg-status-healthy/10 text-status-healthy border-status-healthy/30",
  "Planned Pause": "bg-status-paused/10 text-status-paused border-status-paused/30",
  "Healthy, Paused": "bg-secondary text-secondary-foreground border-border",
  "Restart Soon": "bg-status-restart/10 text-status-restart border-status-restart/30",
};

export function LifecycleBadge({ value }: { value: Lifecycle }) {
  return <Badge className={classes[value]}>{value}</Badge>;
}
