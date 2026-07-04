import type { ReactNode } from "react";

// The canonical terra load-failure banner. Several admin surfaces rendered this
// exact markup inline; this is the shared home for it so the colour, radius, and
// padding stay consistent.
export function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="m-0 rounded-[8px] border border-clay bg-claySoft px-3.5 py-2.5 font-sans text-sm text-clayDeep"
    >
      {children}
    </p>
  );
}
