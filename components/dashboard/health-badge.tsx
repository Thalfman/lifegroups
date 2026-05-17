import { Badge } from "@/components/ui/badge";

type Health = "Healthy" | "Watch" | "Needs Follow-up";

const classes: Record<Health, string> = {
  Healthy: "bg-status-healthy/10 text-status-healthy border-status-healthy/30",
  Watch: "bg-status-watch/10 text-status-watch border-status-watch/30",
  "Needs Follow-up": "bg-status-followup/10 text-status-followup border-status-followup/30",
};

export function HealthBadge({ value }: { value: Health }) {
  return <Badge className={classes[value]}>{value}</Badge>;
}
