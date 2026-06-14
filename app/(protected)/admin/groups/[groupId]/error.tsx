"use client";

import { DetailRouteError } from "@/components/lg/DetailRouteError";

export default function GroupDetailError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <DetailRouteError
      {...props}
      backHref="/admin/groups"
      backLabel="Back to groups"
    />
  );
}
