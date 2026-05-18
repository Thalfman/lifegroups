import { SectionHeader } from "@/components/layout/shell";
import { PhaseGateNotice } from "@/components/admin/phase-gate-notice";
import { DisabledAdminActionCard } from "@/components/admin/disabled-admin-action-card";
import { EmptyPeopleState } from "@/components/admin/empty-people-state";
import { AuditTrailEmptyState } from "@/components/admin/audit-trail-empty-state";
import { RoleManagementPanel } from "@/components/admin/role-management-panel";
import { GroupAssignmentPanel } from "@/components/admin/group-assignment-panel";

export function PeopleManagementShell() {
  return (
    <div style={{ display: "grid", gap: 36 }}>
      <PhaseGateNotice />

      <section style={{ display: "grid", gap: 18 }}>
        <SectionHeader
          eyebrow="People"
          title="Profiles and members"
          description="Profiles are app-login records; members are non-auth participant records. Both will land here once narrow writes ship."
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 16,
          }}
        >
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

      <section style={{ display: "grid", gap: 18 }}>
        <SectionHeader
          eyebrow="Members"
          title="Non-auth participants"
          description="Tracked through the members table. Members never appear in the role-aware sign-in surface."
        />
        <EmptyPeopleState
          title="No member records loaded"
          description="The member directory will appear here in Phase 5A.1, scoped by the same admin RLS read policies that already gate the rest of the admin dashboard."
        />
      </section>

      <section style={{ display: "grid", gap: 18 }}>
        <SectionHeader
          eyebrow="Audit trail"
          title="Every admin write, kept"
          description="A read-only stream of every admin action: actor, action, target, before/after. Powered by audit_events once Phase 5A.1 starts recording them."
        />
        <AuditTrailEmptyState />
      </section>
    </div>
  );
}
