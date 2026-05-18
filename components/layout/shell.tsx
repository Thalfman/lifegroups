import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";
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
        <div
          style={{
            fontFamily: fontSans,
            fontSize: 10,
            letterSpacing: 1.8,
            textTransform: "uppercase",
            color: P.ink3,
            fontWeight: 600,
            margin: "10px 0 4px",
          }}
        >
          {eyebrow}
        </div>
      ) : null}
      <h2
        style={{
          fontFamily: fontDisplay,
          fontSize: 26,
          fontWeight: 500,
          letterSpacing: -0.6,
          margin: eyebrow ? "0" : "10px 0 0",
          color: P.ink,
          lineHeight: 1.1,
        }}
      >
        {title}
      </h2>
      <p
        style={{
          fontFamily: fontBody,
          fontSize: 14,
          color: P.ink2,
          margin: "8px 0 0",
          lineHeight: 1.55,
          maxWidth: 720,
        }}
      >
        {description}
      </p>
    </div>
  );
}
