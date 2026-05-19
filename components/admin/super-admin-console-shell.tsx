import { SectionHeader } from "@/components/layout/shell";
import { OwnerControlsOverview } from "@/components/admin/owner-controls-overview";
import { AuditTrailSection } from "@/components/admin/audit-trail-section";
import { RoleChangeForm, type AssignableProfile } from "@/components/admin/forms/role-change-form";
import {
  SystemStatusChecklist,
  type ChecklistRow,
} from "@/components/admin/system-status-checklist";
import { P, fontBody } from "@/lib/pastoral";
import type {
  AuditEventsRow,
  GroupsRow,
  MembersRow,
  ProfilesRow,
} from "@/types/database";

export type SuperAdminConsoleData = {
  assignableProfiles: AssignableProfile[];
  auditEvents: AuditEventsRow[];
  profilesById: Map<string, ProfilesRow>;
  membersById: Map<string, MembersRow>;
  groupsById: Map<string, GroupsRow>;
  checklist: ChecklistRow[];
  errors: {
    audit: string | null;
    profiles: string | null;
    groups: string | null;
    members: string | null;
    leaders: string | null;
  };
};

export function SuperAdminConsoleShell({ data }: { data: SuperAdminConsoleData }) {
  const anyError =
    data.errors.audit ||
    data.errors.profiles ||
    data.errors.groups ||
    data.errors.members ||
    data.errors.leaders;

  return (
    <div style={{ display: "grid", gap: 36 }}>
      {anyError ? (
        <div
          role="alert"
          style={{
            background: P.terraSoft,
            border: `1px solid ${P.terra}`,
            borderRadius: 8,
            padding: "12px 14px",
            fontFamily: fontBody,
            fontSize: 13,
            color: "#7d3621",
          }}
        >
          Some sections couldn&rsquo;t load. The page below shows what we did
          get; retry in a moment or check the Supabase connection.
        </div>
      ) : null}

      <OwnerControlsOverview />

      <AuditTrailSection
        events={data.auditEvents}
        profilesById={data.profilesById}
        membersById={data.membersById}
        groupsById={data.groupsById}
        error={data.errors.audit}
      />

      <section style={{ display: "grid", gap: 18 }}>
        <SectionHeader
          eyebrow="Role management"
          title="Change a profile&rsquo;s role"
          description="The one workflow that can change someone&rsquo;s role. Every change records an audit event in the panel above."
        />
        <div
          style={{
            background: P.surface,
            border: `1px solid ${P.line}`,
            borderRadius: 10,
            padding: "18px 22px",
          }}
        >
          <RoleChangeForm profiles={data.assignableProfiles} />
        </div>
      </section>

      <SystemStatusChecklist rows={data.checklist} />
    </div>
  );
}
