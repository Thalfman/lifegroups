import { DetailPageSkeleton } from "@/components/lg/DetailPageSkeleton";

// Layout-matched loading skeleton for the group detail route (repo-sweep #589),
// so navigating into a group shows a detail-shaped skeleton instead of the
// generic list skeleton — no layout shift when the data streams in.
export default function Loading() {
  return <DetailPageSkeleton />;
}
