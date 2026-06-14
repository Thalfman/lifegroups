"use client";

import { DetailRouteError } from "@/components/lg/DetailRouteError";

export default function CheckInsDetailError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <DetailRouteError
      {...props}
      backHref="/admin/check-ins"
      backLabel="Back to check-ins"
    />
  );
}
