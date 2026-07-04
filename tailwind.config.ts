import type { Config } from "tailwindcss";

// Palette colors live in CSS vars (full colors, not channel triples), so
// Tailwind can't compose slash-opacity (`bg-ink/45`) on them by itself — it
// silently emits nothing. This closure makes every token alpha-capable via
// color-mix. Plain usages (`bg-ink`, where Tailwind passes 1 or its
// `var(--tw-*-opacity)` placeholder — the legacy `*-opacity-N` utilities are
// unused here) keep emitting the raw var. The cast is because Tailwind's
// Config type omits the function-color form its resolver supports.
const varColor = (cssVar: string): string =>
  (({ opacityValue }: { opacityValue?: string }) =>
    !opacityValue || opacityValue === "1" || opacityValue.startsWith("var(")
      ? `var(${cssVar})`
      : `color-mix(in oklab, var(${cssVar}) calc(${opacityValue} * 100%), transparent)`) as unknown as string;

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
        // Warm pastoral palette — CSS-var bindings, alpha-capable (varColor)
        bg: varColor("--c-bg"),
        surface: varColor("--c-surface"),
        surfaceAlt: varColor("--c-surfaceAlt"),
        sidebar: varColor("--c-sidebar"),
        line: varColor("--c-line"),
        lineSoft: varColor("--c-lineSoft"),
        ink: varColor("--c-ink"),
        ink2: varColor("--c-ink2"),
        ink3: varColor("--c-ink3"),
        ink4: varColor("--c-ink4"),
        sage: varColor("--c-sage"),
        sageDeep: varColor("--c-sageDeep"),
        sageSoft: varColor("--c-sageSoft"),
        sageTint: varColor("--c-sageTint"),
        clay: varColor("--c-clay"),
        clayDeep: varColor("--c-clayDeep"),
        claySoft: varColor("--c-claySoft"),
        clayTint: varColor("--c-clayTint"),
        amber: varColor("--c-amber"),
        amberText: varColor("--c-amberText"),
        amberSoft: varColor("--c-amberSoft"),
        rose: varColor("--c-rose"),
        roseSoft: varColor("--c-roseSoft"),
        blue: varColor("--c-blue"),
        blueSoft: varColor("--c-blueSoft"),
      },
      fontFamily: {
        // "Source Serif 4" must stay quoted in the emitted CSS: an unquoted
        // family with a bare number is an invalid <family-name>, and because
        // the declaration also contains var(--font-newsreader) the failure
        // surfaces at computed-value time — the WHOLE font-family silently
        // resolves to inherit, so `font-display` rendered the body sans font.
        display: [
          "var(--font-newsreader)",
          '"Source Serif 4"',
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
      // Semantic width constraints: `card` for narrow standalone cards,
      // `lede` for header/intro copy line length.
      maxWidth: {
        card: "560px",
        lede: "640px",
      },
    },
  },
  plugins: [],
} satisfies Config;
