import { SimplePageSkeleton } from "@/components/lg/PageSkeleton";

// The leader surface uses a different shell (PastoralAppShell) and a minimal,
// form/calendar-shaped layout, so it gets the neutral skeleton rather than the
// admin dashboard one.
export default function Loading() {
  return <SimplePageSkeleton />;
}
