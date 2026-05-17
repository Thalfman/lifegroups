import { EmptyState } from "@/components/dashboard/cards";

export function EmptyPeopleState({
  title = "No people loaded",
  description = "People, profiles, and member rows are not displayed on this preview. Real data appears here in Phase 5A.1 once the admin write policies and matching read views are verified against live Supabase.",
}: {
  title?: string;
  description?: string;
}) {
  return <EmptyState title={title} description={description} />;
}
