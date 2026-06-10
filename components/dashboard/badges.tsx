import { Badge, type BadgeTone as UiBadgeTone } from "@/components/ui/badge";

// Dashboard status badges, re-implemented directly on the design-system Badge
// (soft bg + deep fg + leading dot + text label). The exported APIs are
// unchanged; only the rendering moved onto the one tone map that carries the
// whole status vocabulary (sage = well · amber = watch · clay = needs
// follow-up).
export type BadgeTone = "healthy" | "watch" | "followup";
export type BadgeLifecycle =
  | "Active"
  | "Planned Pause"
  | "Seasonal Break"
  | "Restart Soon"
  | "Overdue Restart";

const healthToneMap: Record<BadgeTone, UiBadgeTone> = {
  healthy: "sage",
  watch: "amber",
  followup: "clay",
};

const lifecycleToneMap: Record<BadgeLifecycle, UiBadgeTone> = {
  Active: "neutral",
  "Planned Pause": "ghost",
  "Seasonal Break": "ghost",
  "Restart Soon": "amber",
  "Overdue Restart": "clay",
};

export function HealthBadge({
  tone,
  label,
}: {
  tone: BadgeTone;
  label?: string;
}) {
  return (
    <Badge tone={healthToneMap[tone]} dot>
      {label ?? tone}
    </Badge>
  );
}

export function LifecycleBadge({
  status,
  label,
}: {
  status: BadgeLifecycle;
  label?: string;
}) {
  return (
    <Badge tone={lifecycleToneMap[status]} dot>
      {label ?? status}
    </Badge>
  );
}
