// Aliases of the canonical `--c-*` tokens in app/globals.css — kept so the
// ~166 files importing `P` stay coherent while surfaces migrate to Tailwind
// utilities. No hex literals: every value resolves to a canonical var.
export const P = {
  bg: "var(--c-bg)",
  bgDeep: "var(--c-sidebar)",
  surface: "var(--c-surface)",
  ink: "var(--c-ink)",
  ink2: "var(--c-ink2)",
  ink3: "var(--c-ink3)",
  line: "var(--c-line)",
  line2: "var(--c-lineSoft)",
  terra: "var(--c-clay)",
  terraTextStrong: "var(--c-clayDeep)",
  terraSoft: "var(--c-claySoft)",
  sage: "var(--c-sage)",
  sageTextStrong: "var(--c-sageDeep)",
  sageSoft: "var(--c-sageSoft)",
  mustard: "var(--c-amber)",
  mustardTextStrong: "var(--c-amberText)",
  mustardSoft: "var(--c-amberSoft)",
} as const;

export const fontDisplay = "var(--font-display)";
export const fontBody = "var(--font-body)";
export const fontSans = "var(--font-sans)";
export const fontMono = "var(--font-mono)";

export const paperGrain = {
  position: "absolute",
  inset: 0,
  opacity: 0.3,
  backgroundImage:
    "radial-gradient(circle at 1px 1px, rgba(58,42,26,0.06) 1px, transparent 0)",
  backgroundSize: "4px 4px",
  pointerEvents: "none",
} as const;
