import { Pill, type PillTone } from "@/components/pastoral/primitives";
import type { CapacitySummary } from "@/lib/dashboard/types";

type Bucket = {
  key: "full" | "warning" | "ok" | "unknown" | "excluded";
  label: string;
  tone: PillTone;
  bar: string;
};

const BUCKETS: Bucket[] = [
  { key: "full", label: "Full", tone: "clay", bar: "var(--c-clay)" },
  { key: "warning", label: "Warning", tone: "amber", bar: "oklch(0.7 0.13 80)" },
  { key: "ok", label: "OK", tone: "sage", bar: "var(--c-sage)" },
  { key: "unknown", label: "Unknown", tone: "ghost", bar: "var(--c-ink4)" },
  { key: "excluded", label: "Excluded", tone: "neutral", bar: "var(--c-ink4)" },
];

export function CapacityBuckets({ summary }: { summary: CapacitySummary }) {
  const total = Math.max(
    1,
    summary.counts.full +
      summary.counts.warning +
      summary.counts.ok +
      summary.counts.unknown,
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {BUCKETS.map((b) => {
        const count = summary.counts[b.key];
        const pct = b.key === "excluded" ? 0 : (count / total) * 100;
        return (
          <div
            key={b.key}
            style={{
              display: "grid",
              gridTemplateColumns: "92px 1fr 28px",
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
                  width: `${pct}%`,
                  background: b.bar,
                  transition: "width 200ms ease",
                }}
              />
            </div>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                color: "var(--c-ink2)",
                textAlign: "right",
              }}
            >
              {count}
            </span>
          </div>
        );
      })}
    </div>
  );
}
