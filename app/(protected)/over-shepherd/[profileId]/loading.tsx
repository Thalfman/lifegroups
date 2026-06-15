import { DetailPageSkeleton } from "@/components/lg/DetailPageSkeleton";

// Layout-matched loading skeleton for the over-shepherd's leader-care detail
// route (repo-sweep #599 loading polish), so opening a covered leader shows a
// detail-shaped skeleton instead of the generic list skeleton — no layout shift
// when the data streams in.
export default function Loading() {
  return <DetailPageSkeleton />;
}
