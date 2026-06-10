import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // shadcn token bridge (HSL-driven; kept for existing shadcn parts)
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: "hsl(var(--card))",
        "card-foreground": "hsl(var(--card-foreground))",
        primary: "hsl(var(--primary))",
        "primary-foreground": "hsl(var(--primary-foreground))",
        secondary: "hsl(var(--secondary))",
        "secondary-foreground": "hsl(var(--secondary-foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        accent: "hsl(var(--accent))",
        "accent-foreground": "hsl(var(--accent-foreground))",
        destructive: "hsl(var(--destructive))",
        "destructive-foreground": "hsl(var(--destructive-foreground))",
        border: "hsl(var(--border))",
        ring: "hsl(var(--ring))",
        // Warm pastoral palette — direct CSS-var bindings
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
        clayDeep: "var(--c-clayDeep)",
        claySoft: "var(--c-claySoft)",
        clayTint: "var(--c-clayTint)",
        amber: "var(--c-amber)",
        amberText: "var(--c-amberText)",
        amberSoft: "var(--c-amberSoft)",
        rose: "var(--c-rose)",
        roseSoft: "var(--c-roseSoft)",
        blue: "var(--c-blue)",
        blueSoft: "var(--c-blueSoft)",
      },
      fontFamily: {
        display: [
          "var(--font-newsreader)",
          "Source Serif 4",
          "Georgia",
          "serif",
        ],
        sans: [
          "var(--font-geist)",
          "Inter Tight",
          "-apple-system",
          "system-ui",
          "sans-serif",
        ],
        mono: [
          "var(--font-jetbrains)",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      // Type scale (fixed rem, ratio ≈1.2). 11px is the floor for anything
      // readable; text-base (14px) is the default body/UI size.
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1.35" }],
        xs: ["0.75rem", { lineHeight: "1.4" }],
        sm: ["0.8125rem", { lineHeight: "1.45" }],
        base: ["0.875rem", { lineHeight: "1.55" }],
        md: ["0.9375rem", { lineHeight: "1.5" }],
        lg: ["1.0625rem", { lineHeight: "1.4" }],
        xl: ["1.25rem", { lineHeight: "1.35" }],
        "2xl": ["1.5rem", { lineHeight: "1.25" }],
        "3xl": ["1.875rem", { lineHeight: "1.15" }],
        "4xl": ["2.375rem", { lineHeight: "1.08", letterSpacing: "-0.5px" }],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(60, 45, 30, 0.04), 0 4px 14px rgba(60, 45, 30, 0.04)",
        softLg:
          "0 2px 4px rgba(60, 45, 30, 0.05), 0 12px 32px rgba(60, 45, 30, 0.08)",
      },
      borderRadius: {
        sm: "10px",
        md: "12px",
        lg: "14px",
        pill: "999px",
      },
      // Semantic density names, wired to the existing CSS vars
      spacing: {
        card: "var(--space-card)",
        gutter: "var(--space-gap)",
        row: "var(--space-row)",
      },
      zIndex: {
        base: "1",
        sticky: "10",
        dropdown: "40",
        overlay: "60",
        drawer: "61",
        toast: "70",
      },
      transitionDuration: {
        "250": "250ms",
      },
    },
  },
  plugins: [],
} satisfies Config;
