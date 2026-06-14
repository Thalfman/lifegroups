"use client";

import { useEffect } from "react";
import { AppErrorState } from "@/components/lg/AppErrorState";
import { Button, LinkButton } from "@/components/ui/button";

// Error boundary for the authenticated surfaces (#559). When a data load or
// navigation in an /admin, /leader, or /over-shepherd page throws, this renders
// a branded, app-like state with a clear retry path instead of a raw error.
export default function ProtectedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The server render already logged the throw structurally; surface it to
    // the browser console for client-side debugging.
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-bg font-sans text-ink">
      <AppErrorState
        title="This page didn't load"
        message="Something interrupted the connection. Check your network and try again."
        action={
          <>
            <Button type="button" variant="primary" onClick={() => reset()}>
              Try again
            </Button>
            <LinkButton href="/" variant="ghost">
              Go to home
            </LinkButton>
          </>
        }
      />
    </div>
  );
}
