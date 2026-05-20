export type AvatarTone = "sage" | "clay" | "amber" | "blue";

const TONES: Record<AvatarTone, { bg: string; fg: string }> = {
  sage: { bg: "var(--c-sageSoft)", fg: "var(--c-sageDeep)" },
  clay: { bg: "var(--c-claySoft)", fg: "var(--c-clay)" },
  amber: { bg: "var(--c-amberSoft)", fg: "oklch(0.45 0.13 70)" },
  blue: { bg: "var(--c-blueSoft)", fg: "var(--c-blue)" },
};

export function Avatar({
  name,
  size = 28,
  tone = "sage",
}: {
  name: string | null | undefined;
  size?: number;
  tone?: AvatarTone;
}) {
  const initials = (name || "?")
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const t = TONES[tone];
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: t.bg,
        color: t.fg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-body)",
        fontSize: size * 0.36,
        fontWeight: 600,
        letterSpacing: 0.4,
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}
