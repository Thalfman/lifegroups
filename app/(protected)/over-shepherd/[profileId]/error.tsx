"use client";

import { DetailRouteError } from "@/components/lg/DetailRouteError";

export default function OverShepherdDetailError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <DetailRouteError
      {...props}
      backHref="/over-shepherd"
      backLabel="Back to your shepherds"
    />
  );
}
