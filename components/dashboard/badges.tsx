import { PBadge, type PTone } from "@/components/pastoral/atoms";

export type BadgeTone = "healthy" | "watch" | "followup";
export type BadgeLifecycle =
  | "Active"
  | "Planned Pause"
  | "Seasonal Break"
  | "Restart Soon"
  | "Overdue Restart";

const lifecycleToneMap: Record<BadgeLifecycle, PTone> = {
  Active: "neutral",
  "Planned Pause": "pause",
  "Seasonal Break": "pause",
  "Restart Soon": "watch",
  "Overdue Restart": "followup",
};

export function HealthBadge({ tone, label }: { tone: BadgeTone; label?: string }) {
  return <PBadge tone={tone}>{label ?? tone}</PBadge>;
}

export function LifecycleBadge({
  status,
  label,
}: {
  status: BadgeLifecycle;
  label?: string;
}) {
  return <PBadge tone={lifecycleToneMap[status]}>{label ?? status}</PBadge>;
}
