import { Pill, type PillTone } from "@/components/lg/Pill";
import type { CapacitySummary } from "@/lib/dashboard/types";

export function CapacityBuckets({ summary }: { summary: CapacitySummary }) {
  const total = Math.max(
    1,
    summary.counts.full +
      summary.counts.warning +
      summary.counts.ok +
      summary.counts.unknown,
  );
  const buckets: { label: string; tone: PillTone; count: number; bar: string }[] = [
    { label: "Full", tone: "clay", count: summary.counts.full, bar: "var(--c-clay)" },
    {
      label: "Warning",
      tone: "amber",
      count: summary.counts.warning,
      bar: "oklch(0.7 0.13 80)",
    },
    { label: "Open", tone: "sage", count: summary.counts.ok, bar: "var(--c-sage)" },
    {
      label: "Unknown",
      tone: "ghost",
      count: summary.counts.unknown,
      bar: "var(--c-ink4)",
    },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {buckets.map((b) => (
        <div
          key={b.label}
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr auto",
            alignItems: "center",
            gap: 12,
            padding: "8px 10px",
            borderRadius: 8,
            background: "var(--c-surfaceAlt)",
          }}
        >
          <Pill tone={b.tone}>{b.label}</Pill>
          <div
            style={{
              height: 4,
              background: "var(--c-line)",
              borderRadius: 999,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${(b.count / total) * 100}%`,
                background: b.bar,
              }}
            />
          </div>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              color: "var(--c-ink2)",
              minWidth: 24,
              textAlign: "right",
            }}
          >
            {b.count}
          </span>
        </div>
      ))}
    </div>
  );
}
