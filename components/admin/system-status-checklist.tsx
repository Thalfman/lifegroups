import { SectionHeader } from "@/components/layout/shell";
import { cn } from "@/lib/utils";

export type ChecklistTone = "ok" | "warn" | "info";

export type ChecklistRow = {
  key: string;
  label: string;
  description: string;
  tone: ChecklistTone;
};

// Status vocabulary: sage = in place, amber = needs attention, quiet = note.
const TONE_STYLE: Record<
  ChecklistTone,
  { chip: string; word: string; glyph: string; label: string }
> = {
  ok: {
    chip: "border-sage bg-sageSoft text-sageDeep",
    word: "text-sageDeep",
    glyph: "OK",
    label: "Good",
  },
  warn: {
    chip: "border-amber bg-amberSoft text-amberText",
    word: "text-amberText",
    glyph: "—",
    label: "Missing",
  },
  info: {
    chip: "border-line bg-surface text-ink2",
    word: "text-ink2",
    glyph: "·",
    label: "Note",
  },
};

export function SystemStatusChecklist({ rows }: { rows: ChecklistRow[] }) {
  return (
    <section className="grid gap-4">
      <SectionHeader
        eyebrow="System status"
        title="What&rsquo;s in place"
        description="A check of the core data and audit access. Useful right after first setting up the app."
      />
      <ol className="m-0 grid list-none gap-px overflow-hidden rounded-md border border-line bg-lineSoft p-0">
        {rows.map((row) => {
          const t = TONE_STYLE[row.tone];
          return (
            <li
              key={row.key}
              className="grid min-h-11 grid-cols-[auto_1fr_auto] items-center gap-3.5 bg-surface px-4 py-3"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "inline-flex h-6 w-[34px] items-center justify-center rounded-pill border font-sans text-2xs font-bold",
                  t.chip
                )}
              >
                {t.glyph}
              </span>
              <div className="min-w-0">
                <div className="mb-0.5 font-sans text-base font-medium text-ink">
                  {row.label}
                </div>
                <div className="font-sans text-sm text-ink3">
                  {row.description}
                </div>
              </div>
              <span className={cn("font-sans text-xs font-semibold", t.word)}>
                <span className="sr-only">Status: </span>
                {t.label}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
