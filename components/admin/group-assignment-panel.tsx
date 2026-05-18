import { SectionHeader } from "@/components/layout/shell";
import { DisabledAdminActionCard } from "@/components/admin/disabled-admin-action-card";

export function GroupAssignmentPanel() {
  return (
    <section style={{ display: "grid", gap: 18 }}>
      <SectionHeader
        eyebrow="Group assignments"
        title="Place leaders and members"
        description="Each assignment writes a single allowlisted row to either group_leaders or group_memberships and is gated by a narrow INSERT RLS policy in Phase 5A.1."
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
        }}
      >
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
