import { WorkspaceSectionNav } from "@/components/admin/workspace-section-nav";
import { RoleChangeForm } from "@/components/admin/forms/role-change-form";
import { InviteWorkflowForm } from "@/components/admin/forms/invite-workflow-form";
import { ProfileStatusForm } from "@/components/admin/forms/profile-status-form";
import { PasswordResetForm } from "@/components/admin/forms/password-reset-form";
import { CoverageAssignForm } from "@/components/admin/forms/coverage-assign-form";
import { CoverageEndForm } from "@/components/admin/forms/coverage-end-form";
import { PeopleImportForm } from "@/components/admin/forms/people-import-form";
import { SetupReturnBanner } from "@/components/lg/admin/setup-return-banner";
import { StatusBadge } from "@/components/admin/console-status";
import { listAccountStatusProfiles } from "@/lib/admin/super-admin-console-model";
import type { SuperAdminConsoleData } from "@/components/admin/super-admin/console-data";
import {
  Panel,
  PanelTitle,
  SubsectionHeader,
  TWO_CARD_GRID_CLASS,
  WorkspaceHeader,
} from "@/components/admin/super-admin/console-primitives";

// ---------------------------------------------------------------------------
// Workspace 2 — Access
// ---------------------------------------------------------------------------

export function AccessWorkspace({ data }: { data: SuperAdminConsoleData }) {
  return (
    <div className="grid min-w-0 gap-4">
      <WorkspaceHeader
        title="Access"
        description="Roles, invitations, and account status. Guardrails are enforced for you: you can’t change your own role, super admin can’t be assigned from the app, and every action is audited."
      />
      <WorkspaceSectionNav
        ariaLabel="Access sections"
        sections={[
          { id: "change-role", label: "Change role" },
          { id: "invite", label: "Invite user" },
          { id: "account-status", label: "Account status" },
          { id: "people-import", label: "People import" },
          { id: "coverage", label: "Coverage" },
        ]}
      />
      {/* Change role gets its own full-width row (#455): squeezed into the
          auto-fit forms grid its 1fr/160px/auto columns collapsed the Profile
          select and left tall dead space when a neighbour ran longer. */}
      <Panel id="change-role">
        <PanelTitle>Change role</PanelTitle>
        <RoleChangeForm profiles={data.assignableProfiles} />
      </Panel>
      {/* One unified invite card (#460): email invite and shareable link are
          a delivery choice inside the same workflow, so role/group are picked
          once instead of across two near-identical panels. */}
      <Panel id="invite">
        <InviteWorkflowForm groups={data.inviteUserGroups} />
      </Panel>
      <AccountManagementCard data={data} />

      <section className="grid gap-3.5">
        <SubsectionHeader
          title="People Ops"
          hint="Bulk-add people and manage over-shepherd coverage."
        />
        <div className={TWO_CARD_GRID_CLASS}>
          <PeopleImportCard />
          <CoverageManagementCard data={data} />
        </div>
      </section>
    </div>
  );
}

// Per-profile disable / re-enable + password reset. Lists every loaded profile
// except the bootstrap super_admin (which the RPC also refuses). The actor's own
// profile is guarded server-side. Rendered as a status table with non-wrapping
// action buttons.
function AccountManagementCard({ data }: { data: SuperAdminConsoleData }) {
  const profiles = listAccountStatusProfiles(data.profilesById);

  return (
    <Panel id="account-status">
      <PanelTitle>Account status</PanelTitle>
      <p className="m-0 font-sans text-sm text-ink2">
        Disable or re-enable a profile, or send a password-reset email. Every
        action is audited. You can&rsquo;t disable yourself or the super admin.
      </p>
      {profiles.length === 0 ? (
        <p className="m-0 font-sans text-sm text-ink3">No profiles loaded.</p>
      ) : (
        <div className="grid gap-px overflow-hidden rounded-sm border border-line bg-lineSoft">
          {profiles.map((p) => (
            <div
              key={p.id}
              className="flex min-h-11 flex-wrap items-center justify-between gap-3 bg-surface px-3.5 py-2.5"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 font-sans text-sm font-semibold text-ink">
                  {p.full_name}
                  <StatusBadge
                    label={p.status === "active" ? "Active" : "Disabled"}
                    tone={p.status === "active" ? "good" : "disabled"}
                  />
                </div>
                <div className="font-sans text-xs text-ink2">{p.email}</div>
              </div>
              {/* nowrap keeps the two small actions on one line rather than
                  stacking into two-line buttons (Admin Interaction Model). */}
              <div className="flex flex-nowrap items-start gap-2.5">
                <ProfileStatusForm
                  profileId={p.id}
                  profileName={p.full_name}
                  currentStatus={p.status}
                />
                <PasswordResetForm
                  profileId={p.id}
                  profileName={p.full_name}
                  email={p.email}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function PeopleImportCard() {
  return (
    <Panel id="people-import">
      {/* ADR 0027: this panel is the target of the setup checklist's "Import
          people" deep-link for super admins; the console scrolls here on the
          hash, so the return affordance lives at the target, not page-top. */}
      <SetupReturnBanner />
      <PanelTitle>People import</PanelTitle>
      <p className="m-0 font-sans text-sm text-ink2">
        Upload a CSV file or paste rows to create shepherd profiles and member
        records in one audited batch. Parsing and de-duplication run before any
        write; skipped rows are reported back. (The same importer lives in
        Settings → System.)
      </p>
      <PeopleImportForm />
    </Panel>
  );
}

// Current coverage list (with end controls) + the assign form.
function CoverageManagementCard({ data }: { data: SuperAdminConsoleData }) {
  return (
    <Panel id="coverage">
      <PanelTitle>Coverage</PanelTitle>
      <p className="m-0 font-sans text-sm text-ink2">
        Assign or end Over-Shepherd → Leader coverage. Edits write to the same
        records the cadence tiers and over-shepherd scoping already read.
      </p>
      <CoverageAssignForm
        overShepherds={data.overShepherds}
        leaders={data.coverageLeaders}
      />
      <div className="grid gap-2">
        {data.coverageAssignments.length === 0 ? (
          <p className="m-0 font-sans text-sm text-ink3">
            No active coverage assignments.
          </p>
        ) : (
          data.coverageAssignments.map((a) => (
            <div
              key={a.id}
              className="flex min-h-11 items-center justify-between gap-3 rounded-sm border border-line px-3 py-2.5"
            >
              <div>
                <div className="font-sans text-sm font-semibold text-ink">
                  {a.shepherd_name} → {a.over_shepherd_name}
                </div>
                <div className="font-sans text-xs text-ink2">
                  since {a.assigned_at}
                </div>
              </div>
              <CoverageEndForm assignmentId={a.id} />
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}
