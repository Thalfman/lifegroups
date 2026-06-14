import type { ReactNode } from "react";
import Link from "next/link";
import { paperGrain } from "@/lib/pastoral";
import { PSeal } from "@/components/pastoral/atoms";

// Shared chrome for the public (unauthenticated) pages — the grain background
// and the brand header (seal + wordmark linking home). Each page supplies its
// own <main> as children; the centered vs. top-aligned layout varies per page.
// Extracted from the six public pages (login-adjacent + store pages) that
// repeated this byte-for-byte.
export function PublicPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="lg-m-noscrollx relative flex min-h-screen flex-col bg-bg font-sans text-ink">
      <div aria-hidden="true" style={paperGrain} />

      <header className="relative z-base border-b border-line bg-surface px-4 py-3 md:px-9 md:py-4">
        <Link
          href="/"
          className="inline-flex items-center gap-3 text-inherit no-underline"
        >
          <PSeal />
          <div className="font-display text-md font-medium text-ink md:text-lg">
            Fox Valley Church Life Groups
          </div>
        </Link>
      </header>

      {children}
    </div>
  );
}
