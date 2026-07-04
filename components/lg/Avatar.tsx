import { cn } from "@/lib/utils";

export type AvatarTone = "sage" | "clay" | "amber" | "blue";

const TONES: Record<AvatarTone, string> = {
  sage: "bg-sageSoft text-sageDeep",
  clay: "bg-claySoft text-clay",
  amber: "bg-amberSoft text-amberText",
  blue: "bg-blueSoft text-blue",
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
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-pill font-sans font-semibold tracking-[0.4px]",
        TONES[tone]
      )}
      // Size is caller-supplied at runtime, so the box + scaled type stay inline.
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials}
    </div>
  );
}
