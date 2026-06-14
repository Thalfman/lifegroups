import type { ReactNode } from "react";
import { PSeal } from "@/components/pastoral/atoms";

// Branded, app-like error / offline state (#560 mobile store roadmap Phase 2).
// Presentational and reusable: error boundaries pass a client retry button as
// `action`. Renders in the app's visual language (seal, display type, ink/cream
// palette) so an installed PWA / native shell never shows a bare browser error.
//
// `headingLevel` defaults to 1 because the primary use is a full-page error
// boundary (it owns the page's only h1). Embedded previews (e.g. the a11y
// harness) pass a lower level so they don't introduce a second h1.
export function AppErrorState({
  title = "Something went wrong",
  message,
  action,
  headingLevel = 1,
}: {
  title?: string;
  message: string;
  action?: ReactNode;
  headingLevel?: 1 | 2 | 3;
}) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div className="grid min-h-[60vh] place-items-center px-6 py-12">
      <div className="w-full max-w-[440px] text-center">
        <div className="mb-5 flex justify-center">
          <PSeal size={40} />
        </div>
        <Heading className="m-0 mb-2 font-display text-2xl font-normal text-ink md:text-3xl">
          {title}
        </Heading>
        <p className="m-0 mb-6 font-sans text-base text-ink2">{message}</p>
        {action ? (
          <div className="flex flex-wrap items-center justify-center gap-3">
            {action}
          </div>
        ) : null}
      </div>
    </div>
  );
}
