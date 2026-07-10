"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { AppErrorState } from "@/components/lg/AppErrorState";
import { Button, LinkButton } from "@/components/ui/button";
import { reportClientError } from "@/components/observability/report-client-error";

// Shared body for the data-heavy detail routes' segment-level `error.tsx`
// boundaries (repo-sweep #586). A failed detail read is caught here — scoped to
// the route segment — so the persistent app shell (sidebar/topbar) stays mounted
// and the operator gets a local "try again" plus a way back to the listing,
// instead of the whole protected surface resetting at the top-level boundary.
//
// Mirrors the look of the top-level `app/(protected)/error.tsx` (AppErrorState +
// retry/back actions), but renders inside the shell so it omits the full-page
// `min-h-screen` wrapper. `headingLevel={2}` because the shell already owns the
// page chrome; this isn't the document's only heading.
export function DetailRouteError({
  error,
  reset,
  backHref,
  backLabel,
  title = "This page didn't load",
  message = "Something interrupted the connection. Check your network and try again.",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  backHref: string;
  backLabel: string;
  title?: string;
  message?: string;
}) {
  const pathname = usePathname();
  useEffect(() => {
    // Console for local debugging; the beacon puts the failure in the
    // structured log drain (#861).
    console.error(error);
    reportClientError(error, pathname);
  }, [error, pathname]);

  return (
    <AppErrorState
      headingLevel={2}
      title={title}
      message={message}
      action={
        <>
          <Button type="button" variant="primary" onClick={() => reset()}>
            Try again
          </Button>
          <LinkButton href={backHref} variant="ghost">
            {backLabel}
          </LinkButton>
        </>
      }
    />
  );
}
