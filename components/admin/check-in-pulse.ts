import type { PTone } from "@/components/pastoral/atoms";
import type { LeaderPulseDisplay } from "@/lib/admin/check-ins";

// One label + tone per leader pulse, shared by the check-in detail and review
// shells so the two surfaces can't drift apart.
export const PULSE_LABELS: Record<
  LeaderPulseDisplay,
  { label: string; tone: PTone }
> = {
  healthy: { label: "Healthy", tone: "healthy" },
  watch: { label: "Watch", tone: "watch" },
  needs_follow_up: { label: "Needs follow-up", tone: "followup" },
};
