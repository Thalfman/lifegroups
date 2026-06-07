import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { PeopleManagementShell } from "@/components/admin/people-management-shell";
import { requireAdmin } from "@/lib/auth/session";
import { isSuperAdminRole } from "@/lib/auth/roles";
import { currentUtcDateIso } from "@/lib/supabase/read-models";
import { loadPeoplePageData } from "@/components/admin/people/people-data";

export const dynamic = "force-dynamic";

export default async function AdminPeoplePage() {
  const session = await requireAdmin();
  const isSuperAdmin = isSuperAdminRole(session.profile.role);
  const today = currentUtcDateIso();

  const { data, pipeline, needsContactProfileIds } = await loadPeoplePageData({
    currentActorProfileId: session.profile.id,
    todayIso: today,
  });

  return (
    <>
      <PageHeader
        eyebrow="People"
        title="People"
        italic="& apprentices"
        lede="Everyone involved and how they relate to groups — the directory, leaders, members, and the apprentice pipeline."
      />
      <PageBody>
        <PeopleManagementShell
          data={data}
          pipeline={pipeline}
          needsContactProfileIds={needsContactProfileIds}
          isSuperAdmin={isSuperAdmin}
        />
      </PageBody>
    </>
  );
}
