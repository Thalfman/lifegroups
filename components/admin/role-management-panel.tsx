import { SectionHeader } from "@/components/layout/shell";
import { DisabledAdminActionCard } from "@/components/admin/disabled-admin-action-card";

export function RoleManagementPanel() {
  return (
    <section className="space-y-4">
      <SectionHeader
        title="Roles"
        description="Promote, demote, or deactivate the admins and leaders who can sign in. Every action here is gated on a self-escalation guard and a narrow column allowlist that ships in Phase 5A.1."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <DisabledAdminActionCard
          title="Add ministry admin"
          description="Create a new ministry_admin profile. Only super_admin will be allowed to call this action, and never against the caller's own profile."
        />
        <DisabledAdminActionCard
          title="Change role"
          description="Change a profile's role between ministry_admin, staff_viewer, leader, and co_leader. super_admin cannot be assigned through the app and admins cannot change their own role."
        />
        <DisabledAdminActionCard
          title="Deactivate person"
          description="Set status = 'inactive' on a profile or member. No row deletion; deactivation is the supported off-boarding path in the first implementation."
        />
      </div>
    </section>
  );
}
