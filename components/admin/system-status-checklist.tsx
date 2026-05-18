import { SectionHeader } from "@/components/layout/shell";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";

export type ChecklistTone = "ok" | "warn" | "info";

export type ChecklistRow = {
  key: string;
  label: string;
  description: string;
  tone: ChecklistTone;
};

const TONE_STYLE: Record<
  ChecklistTone,
  { color: string; background: string; border: string; glyph: string; word: string }
> = {
  ok: {
    color: "#3e4f29",
    background: P.sageSoft,
    border: P.sage,
    glyph: "OK",
    word: "Good",
  },
  warn: {
    color: "#7d3621",
    background: P.terraSoft,
    border: P.terra,
    glyph: "—",
    word: "Missing",
  },
  info: {
    color: P.ink2,
    background: P.surface,
    border: P.line,
    glyph: "·",
    word: "Note",
  },
};

export function SystemStatusChecklist({ rows }: { rows: ChecklistRow[] }) {
  return (
    <section style={{ display: "grid", gap: 18 }}>
      <SectionHeader
        eyebrow="System status"
        title="What&rsquo;s in place"
        description="A quick read of the foundational data and audit access. Useful after a fresh deploy or a seed import."
      />
      <ol
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "grid",
          gap: 1,
          background: P.line2,
          border: `1px solid ${P.line}`,
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        {rows.map((row) => {
          const t = TONE_STYLE[row.tone];
          return (
            <li
              key={row.key}
              style={{
                background: P.surface,
                padding: "12px 16px",
                display: "grid",
                gridTemplateColumns: "auto 1fr auto",
                gap: 14,
                alignItems: "center",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 34,
                  height: 24,
                  borderRadius: 999,
                  background: t.background,
                  border: `1px solid ${t.border}`,
                  color: t.color,
                  fontFamily: fontSans,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {t.glyph}
              </span>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: fontDisplay,
                    fontSize: 14,
                    color: P.ink,
                    fontWeight: 500,
                    marginBottom: 2,
                  }}
                >
                  {row.label}
                </div>
                <div
                  style={{
                    fontFamily: fontBody,
                    fontSize: 12,
                    color: P.ink3,
                    lineHeight: 1.5,
                  }}
                >
                  {row.description}
                </div>
              </div>
              <span
                style={{
                  fontFamily: fontSans,
                  fontSize: 11,
                  letterSpacing: 1.4,
                  textTransform: "uppercase",
                  color: t.color,
                  fontWeight: 600,
                }}
              >
                <span className="sr-only">Status: </span>
                {t.word}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
