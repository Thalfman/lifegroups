import { AuditTrailSection } from "@/components/admin/audit-trail-section";
import {
  AuditWorkspace,
  type AuditEntry,
} from "@/components/admin/audit-workspace";
import { buildAuditTrailEntries } from "@/lib/admin/audit-trail-entries";
import type { SuperAdminConsoleData } from "@/components/admin/super-admin/console-data";

// ---------------------------------------------------------------------------
// Workspace 5 — Audit
// ---------------------------------------------------------------------------

export function AuditWorkspacePanel({ data }: { data: SuperAdminConsoleData }) {
  const auditSection = (
    <AuditTrailSection
      events={data.auditEvents}
      profilesById={data.profilesById}
      membersById={data.membersById}
      groupsById={data.groupsById}
      error={data.errors.audit}
    />
  );

  // On an audit read failure there are no events to filter and the section
  // surfaces the error itself — render it directly (no filter UI) so a filter
  // interaction can't mask the failure behind a misleading "no matches" state.
  if (data.errors.audit) {
    return <div className="min-w-0">{auditSection}</div>;
  }

  // The Map-dependent summaries are computed here, server-side, so the client
  // filter receives only flat, serialisable entries (RSC can't ship the Maps).
  // Typed as AuditEntry so the lib model and the client filter can't drift.
  const entries: AuditEntry[] = buildAuditTrailEntries(data.auditEvents, {
    profilesById: data.profilesById,
    membersById: data.membersById,
    groupsById: data.groupsById,
  });

  return (
    <div className="min-w-0">
      <AuditWorkspace entries={entries} fullList={auditSection} />
    </div>
  );
}
