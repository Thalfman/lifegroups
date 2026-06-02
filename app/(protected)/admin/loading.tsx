import { PageSkeleton } from "@/components/lg/PageSkeleton";

// Shared Suspense fallback for every admin section. Because this boundary wraps
// all descendant pages, navigating between sibling sections (e.g. People ->
// Groups) commits instantly to this skeleton instead of freezing on the old
// page, and it lets <Link> prefetch the static shell for in-viewport sidebar
// links. The persistent admin layout (sidebar + topbar) sits above this
// boundary and stays mounted.
export default function Loading() {
  return <PageSkeleton />;
}
