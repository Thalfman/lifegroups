import { EmptyState } from "@/components/dashboard/cards";

export function AuditTrailEmptyState() {
  return (
    <EmptyState
      title="No audit events recorded"
      description="The audit trail is empty by design in Phase 5A.0. Once Phase 5A.1 ships, every admin write — create, assign, role change, deactivate — will record an audit_events row (actor, action, target, before/after) and surface here."
    />
  );
}
