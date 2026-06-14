"use client";

import { DetailRouteError } from "@/components/lg/DetailRouteError";

export default function PersonDetailError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <DetailRouteError
      {...props}
      backHref="/admin/people"
      backLabel="Back to people"
    />
  );
}
