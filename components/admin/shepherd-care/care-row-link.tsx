import Link from "next/link";
import type { ReactNode } from "react";

// The shared row used by the shepherd-care dashboard list cards (recent
// interactions, upcoming touchpoints): a full-width link with a bold name +
// muted subtitle on the left and a trailing slot (badge / relative label) on
// the right. Extracted so the row chrome can't drift between the two cards.
const ROW_LINK =
  "flex min-h-11 items-baseline justify-between gap-3 border-b border-lineSoft py-2.5 text-inherit no-underline transition-colors duration-150 hover:bg-surfaceAlt";

export function CareRowLink({
  href,
  title,
  subtitle,
  trailing,
}: {
  href: string;
  title: ReactNode;
  subtitle: ReactNode;
  trailing: ReactNode;
}) {
  return (
    <Link href={href} className={ROW_LINK}>
      <div className="min-w-0 flex-1">
        <div className="font-sans text-base font-semibold text-ink [overflow-wrap:anywhere]">
          {title}
        </div>
        <div className="mt-0.5 font-sans text-sm text-ink3">{subtitle}</div>
      </div>
      {trailing}
    </Link>
  );
}
