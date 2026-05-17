import { EmptyState } from "@/components/dashboard/cards";

export function EmptyPeopleState({
  title = "No people loaded",
  description = "Phase 5A.0 does not display people, profiles, or member rows. Real data appears here in Phase 5A.1 after write policies and the matching read views are verified against a live Supabase project.",
}: {
  title?: string;
  description?: string;
}) {
  return <EmptyState title={title} description={description} />;
}
