import { SectionHeader } from "@/components/layout/shell";
import {
  Card,
  Pill,
  StatusDot,
  type PillTone,
  type StatusDotTone,
} from "@/components/pastoral/primitives";

export type ChecklistTone = "ok" | "warn" | "info";

export type ChecklistRow = {
  key: string;
  label: string;
  description: string;
  tone: ChecklistTone;
};

const TONE_MAP: Record<
  ChecklistTone,
  { dot: StatusDotTone; pill: PillTone; word: string }
> = {
  ok: { dot: "sage", pill: "sage", word: "Good" },
  warn: { dot: "clay", pill: "clay", word: "Missing" },
  info: { dot: "neutral", pill: "neutral", word: "Note" },
};

export function SystemStatusChecklist({ rows }: { rows: ChecklistRow[] }) {
  return (
    <section style={{ display: "grid", gap: 18 }}>
      <SectionHeader
        eyebrow="System status"
        title="What&rsquo;s in place"
        description="A quick read of the foundational data and audit access. Useful after a fresh deploy or a seed import."
      />
      <Card padded={false} style={{ overflow: "hidden" }}>
        <ol
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "grid",
            gap: 0,
          }}
        >
          {rows.map((row, idx) => {
            const t = TONE_MAP[row.tone];
            return (
              <li
                key={row.key}
                style={{
                  padding: "12px 18px",
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  gap: 14,
                  alignItems: "center",
                  borderTop: idx === 0 ? "none" : "1px solid var(--c-lineSoft)",
                }}
              >
                <StatusDot tone={t.dot} size={10} />
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: 14,
                      color: "var(--c-ink)",
                      fontWeight: 500,
                      marginBottom: 3,
                      lineHeight: 1.35,
                    }}
                  >
                    {row.label}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: 12,
                      color: "var(--c-ink3)",
                      lineHeight: 1.5,
                    }}
                  >
                    {row.description}
                  </div>
                </div>
                <Pill tone={t.pill}>
                  <span className="sr-only">Status: </span>
                  {t.word}
                </Pill>
              </li>
            );
          })}
        </ol>
      </Card>
    </section>
  );
}
