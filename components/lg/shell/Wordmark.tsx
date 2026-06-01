import Image from "next/image";
import Link from "next/link";

export function Wordmark({ href = "/admin" }: { href?: string }) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 11,
        color: "inherit",
        textDecoration: "none",
      }}
    >
      <Image
        src="/logo.png"
        alt="Fox Valley Church"
        width={32}
        height={32}
        priority
        style={{
          display: "block",
          width: 32,
          height: 32,
          objectFit: "contain",
        }}
      />
      <div
        style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}
      >
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 16,
            fontWeight: 500,
            color: "var(--c-ink)",
          }}
        >
          Life Groups
        </span>
        <span
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 10,
            letterSpacing: 1.6,
            textTransform: "uppercase",
            color: "var(--c-ink3)",
          }}
        >
          Fox Valley Church
        </span>
      </div>
    </Link>
  );
}
