import type { ReactNode } from "react";
import { PSeal } from "@/components/pastoral/atoms";

// Branded, app-like error / offline state (#560 mobile store roadmap Phase 2).
// Presentational and reusable: error boundaries pass a client retry button as
// `action`. Renders in the app's visual language (seal, display type, ink/cream
// palette) so an installed PWA / native shell never shows a bare browser error.
export function AppErrorState({
  title = "Something went wrong",
  message,
  action,
}: {
  title?: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid min-h-[60vh] place-items-center px-6 py-12">
      <div className="w-full max-w-[440px] text-center">
        <div className="mb-5 flex justify-center">
          <PSeal size={40} />
        </div>
        <h1 className="m-0 mb-2 font-display text-2xl font-normal text-ink md:text-3xl">
          {title}
        </h1>
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
