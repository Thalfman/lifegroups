import Image from "next/image";
import Link from "next/link";

export function Wordmark({ href = "/admin" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 text-inherit no-underline"
    >
      <Image
        src="/logo.png"
        alt="Fox Valley Church"
        width={32}
        height={32}
        priority
        className="block h-8 w-8 object-contain"
      />
      <div className="flex flex-col leading-[1.1]">
        <span className="font-display text-lg font-medium leading-[1.1] text-ink">
          Life Groups
        </span>
        <span className="font-sans text-xs uppercase tracking-[0.14em] text-ink3">
          Fox Valley Church
        </span>
      </div>
    </Link>
  );
}
