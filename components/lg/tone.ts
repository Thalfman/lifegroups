import type { PillTone } from "./Pill";

export interface ToneResult {
  tone: PillTone;
  label: string;
}

export function healthTone(pulse: string | null | undefined): ToneResult {
  switch (pulse) {
    case "healthy":
      return { tone: "sage", label: "Healthy" };
    case "watch":
      return { tone: "amber", label: "Watch" };
    case "needs_follow_up":
      return { tone: "rose", label: "Needs follow-up" };
    case "submitted":
      return { tone: "sage", label: "Submitted" };
    case "missing":
      return { tone: "rose", label: "Missing" };
    case "did_not_meet":
      return { tone: "neutral", label: "Did not meet" };
    case "planned_pause":
      return { tone: "blue", label: "Planned pause" };
    case "unknown":
      return { tone: "ghost", label: "Unknown" };
    default:
      return { tone: "neutral", label: pulse || "—" };
  }
}

export interface CapacityInput {
  members: number;
  capacity: number | null | undefined;
}

export interface CapacityToneResult {
  tone: PillTone;
  label: "Full" | "Warning" | "Open" | "Unknown";
  pct: number | null;
}

export function capacityTone({ members, capacity }: CapacityInput): CapacityToneResult {
  if (capacity == null) return { tone: "ghost", label: "Unknown", pct: null };
  const pct = (members / capacity) * 100;
  if (pct >= 100) return { tone: "clay", label: "Full", pct };
  if (pct >= 80) return { tone: "amber", label: "Warning", pct };
  return { tone: "sage", label: "Open", pct };
}
