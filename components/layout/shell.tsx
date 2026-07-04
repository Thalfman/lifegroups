import { POrnament } from "@/components/pastoral/atoms";

export function SectionHeader({
  title,
  description,
  eyebrow,
}: {
  title: string;
  description: string;
  eyebrow?: string;
}) {
  return (
    <div>
      <POrnament w={56} />
      {eyebrow ? (
        <div className="mb-1 mt-2.5 font-sans text-[10px] font-semibold uppercase tracking-[1.8px] text-ink3">
          {eyebrow}
        </div>
      ) : null}
      {/* Plain string join, not cn(): tailwind-merge doesn't know the custom
          `font-display` family and drops it against `font-medium`. */}
      <h2
        className={
          "m-0 font-display text-[26px] font-medium leading-[1.1] tracking-[-0.6px] text-ink" +
          (eyebrow ? "" : " mt-2.5")
        }
      >
        {title}
      </h2>
      <p className="mb-0 mt-2 max-w-[720px] font-sans text-base text-ink2">
        {description}
      </p>
    </div>
  );
}
