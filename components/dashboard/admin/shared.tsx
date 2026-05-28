import type { ReactNode } from "react";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import type { CapacityStatus } from "@/lib/admin/metrics";
import type { CapacitySource } from "@/lib/dashboard/types";

// Color tokens keyed off the Phase 5A.4 CapacityStatus enum. Used by the
// capacity meter and badges so all surfaces speak the same visual
// vocabulary -- full = terra, warning = mustard, ok = sage, unknown =
// muted line, excluded = ink3.
export function capacityStatusColor(status: CapacityStatus): string {
  switch (status) {
    case "full":
      return P.terra;
    case "warning":
      return P.mustard;
    case "ok":
      return P.sage;
    case "open_by_choice":
      return P.sage;
    case "excluded":
      return P.ink3;
    case "unknown":
    default:
      return P.line;
  }
}

export function capacityStatusLabel(status: CapacityStatus): string {
  switch (status) {
    case "full":
      return "Full";
    case "warning":
      return "Near capacity";
    case "ok":
      return "OK";
    case "open_by_choice":
      return "Open (by choice)";
    case "unknown":
      return "Unknown";
    case "excluded":
      return "Excluded";
  }
}

export function capacitySourceLabel(source: CapacitySource): string {
  switch (source) {
    case "override":
      return "Group override";
    case "group":
      return "Group capacity";
    case "default":
      return "Global default";
    case "unknown":
      return "Unknown";
  }
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontFamily: fontSans,
        color: P.ink3,
        fontSize: 10,
        letterSpacing: 1.3,
        textTransform: "uppercase",
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
}

export function MetaLine({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontFamily: fontBody,
        fontSize: 12.5,
        color: P.ink3,
        lineHeight: 1.45,
      }}
    >
      {children}
    </div>
  );
}

export function formatMeetingTime(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})/.exec(value);
  if (!match) return value;
  const hour = Number.parseInt(match[1], 10);
  const minute = match[2];
  const suffix = hour >= 12 ? "p" : "a";
  const display = ((hour + 11) % 12) + 1;
  return `${display}:${minute}${suffix}`;
}

export function meetingLine(
  day: string | null,
  time: string | null,
): string | null {
  const t = formatMeetingTime(time);
  const d = day?.trim() ?? null;
  if (d && t) return `${d} · ${t}`;
  if (d) return d;
  if (t) return t;
  return null;
}

export function formatCapacityCell(
  effectiveCapacity: number | null,
  source: CapacitySource,
): string {
  if (effectiveCapacity == null) return "Unknown";
  if (source === "default") return `${effectiveCapacity} (default)`;
  if (source === "override") return `${effectiveCapacity} (override)`;
  return String(effectiveCapacity);
}
