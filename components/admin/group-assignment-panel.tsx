import { SectionHeader } from "@/components/layout/shell";
import { DisabledAdminActionCard } from "@/components/admin/disabled-admin-action-card";

export function GroupAssignmentPanel() {
  return (
    <section className="space-y-4">
      <SectionHeader
        title="Group assignments"
        description="Place leaders and members into life groups. Each assignment writes a single allowlisted row to either group_leaders or group_memberships and is gated by a narrow INSERT RLS policy in Phase 5A.1."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <DisabledAdminActionCard
          title="Assign leader to group"
          description="Add a leader or co-leader to a group via group_leaders (active = true). Cannot self-assign. Only the columns group_id, profile_id, role, and active are touched."
        />
        <DisabledAdminActionCard
          title="Assign member to group"
          description="Add a member to a group via group_memberships. Only group_id, member_id, role_in_group, status, and joined_at are touched. Existing rows are never overwritten by a generic update."
        />
      </div>
    </section>
  );
}
