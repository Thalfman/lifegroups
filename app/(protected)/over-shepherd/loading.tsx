import { PageSkeleton } from "@/components/lg/PageSkeleton";

// Suspense fallback for the Over-Shepherd route group, mirroring the admin
// tier's `loading.tsx`. Because this boundary wraps the group's pages,
// navigating into or between Over-Shepherd surfaces commits instantly to this
// skeleton instead of freezing on the previous page while the server read runs.
export default function Loading() {
  return <PageSkeleton />;
}
