"use client";

import { DetailRouteError } from "@/components/lg/DetailRouteError";

export default function ShepherdCareDetailError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <DetailRouteError
      {...props}
      backHref="/admin/shepherd-care"
      backLabel="Back to shepherd care"
    />
  );
}
