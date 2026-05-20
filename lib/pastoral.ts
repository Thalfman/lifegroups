export const P = {
  bg: "#f5ecd9",
  bgDeep: "#ede0c4",
  surface: "#fbf6e8",
  ink: "#3a2a1a",
  ink2: "#6b5641",
  ink3: "#9c8a6d",
  line: "#e3d4af",
  line2: "#ebe0c2",
  terra: "#b85a3c",
  terraTextStrong: "#7d3621",
  terraSoft: "#f2d7c8",
  sage: "#6a7d4f",
  sageTextStrong: "#3e4f29",
  sageSoft: "#dfe4ce",
  mustard: "#c8964a",
  mustardTextStrong: "#6f4f13",
  mustardSoft: "#f0dfb5",
} as const;

// Token references for the new Life Groups Prototype design system.
// Values come from CSS variables declared in `app/globals.css`. Use these
// instead of hex hard-codes in any new component.
export const T = {
  bg: "var(--c-bg)",
  surface: "var(--c-surface)",
  surfaceAlt: "var(--c-surfaceAlt)",
  sidebar: "var(--c-sidebar)",
  line: "var(--c-line)",
  lineSoft: "var(--c-lineSoft)",
  ink: "var(--c-ink)",
  ink2: "var(--c-ink2)",
  ink3: "var(--c-ink3)",
  ink4: "var(--c-ink4)",
  sage: "var(--c-sage)",
  sageDeep: "var(--c-sageDeep)",
  sageSoft: "var(--c-sageSoft)",
  sageTint: "var(--c-sageTint)",
  clay: "var(--c-clay)",
  claySoft: "var(--c-claySoft)",
  clayTint: "var(--c-clayTint)",
  amber: "var(--c-amber)",
  amberSoft: "var(--c-amberSoft)",
  rose: "var(--c-rose)",
  roseSoft: "var(--c-roseSoft)",
  blue: "var(--c-blue)",
  blueSoft: "var(--c-blueSoft)",
  shadow: "var(--c-shadow)",
  shadowLg: "var(--c-shadowLg)",
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
