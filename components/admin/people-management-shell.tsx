import { SectionHeader } from "@/components/layout/shell";
import { PhaseGateNotice } from "@/components/admin/phase-gate-notice";
import { DisabledAdminActionCard } from "@/components/admin/disabled-admin-action-card";
import { EmptyPeopleState } from "@/components/admin/empty-people-state";
import { AuditTrailEmptyState } from "@/components/admin/audit-trail-empty-state";
import { RoleManagementPanel } from "@/components/admin/role-management-panel";
import { GroupAssignmentPanel } from "@/components/admin/group-assignment-panel";

export function PeopleManagementShell() {
  return (
    <div className="space-y-8">
      <PhaseGateNotice />

      <section className="space-y-4">
        <SectionHeader
          title="People"
          description="Create the profiles and member records the rest of the app references. Profiles are app-login records; members are non-auth participant records."
        />
        <div className="grid gap-4 md:grid-cols-2">
          <DisabledAdminActionCard
            title="Add leader"
            description="Create a leader profile (role = leader). Sign-in linkage is handled through the documented Supabase Auth setup, not this form."
          />
          <DisabledAdminActionCard
            title="Add member"
            description="Create a non-auth member record. Members never sign in; they are linked to a group via group_memberships."
          />
        </div>
        <EmptyPeopleState
          title="No profiles loaded"
          description="People records are not fetched on this screen in Phase 5A.0. Phase 5A.1 will load the admin-scoped list once the narrow INSERT/UPDATE policies are in place and verified."
        />
      </section>

      <RoleManagementPanel />

      <GroupAssignmentPanel />

      <section className="space-y-4">
        <SectionHeader
          title="Member records"
          description="Non-auth participants tracked through the members table. Treated separately from profiles so members never appear in the role-aware sign-in surface."
        />
        <EmptyPeopleState
          title="No member records loaded"
          description="The member directory will appear here in Phase 5A.1, scoped by the same admin RLS read policies that already gate the rest of the admin dashboard."
        />
      </section>

      <section className="space-y-4">
        <SectionHeader
          title="Audit trail"
          description="A read-only stream of every admin write: actor, action, target, before/after. Powered by audit_events once Phase 5A.1 starts recording them."
        />
        <AuditTrailEmptyState />
      </section>
    </div>
  );
}
