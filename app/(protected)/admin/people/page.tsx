import { PageBody } from "@/components/lg/PageHeader";
import { PeopleManagementShell } from "@/components/admin/people-management-shell";
import { adminPage } from "@/lib/admin/admin-page";
import { isSuperAdminRole } from "@/lib/auth/roles";
import { currentUtcDateIso } from "@/lib/supabase/read-models";
import { loadPeoplePageData } from "@/components/admin/people/people-data";
import {
  BackToSetupLink,
  isFromSetup,
} from "@/components/lg/admin/back-to-setup-link";

// Wired through the admin page runner (ADR 0028).
export const dynamic = "force-dynamic";

export default adminPage({
  params: (raw) => ({ fromSetup: isFromSetup(raw.searchParams.from) }),
  load: async (_params, session) => {
    const { data, pipeline, needsContactProfileIds } = await loadPeoplePageData(
      {
        currentActorProfileId: session.profile.id,
        todayIso: currentUtcDateIso(),
      }
    );
    return {
      data,
      pipeline,
      needsContactProfileIds,
      isSuperAdmin: isSuperAdminRole(session.profile.role),
    };
  },
  header: () => ({
    eyebrow: "People",
    title: "People",
    italic: "& apprentices",
    lede: "Everyone involved and how they relate to groups — the directory, leaders, members, and the apprentice pipeline.",
  }),
  render: (
    { data, pipeline, needsContactProfileIds, isSuperAdmin },
    { fromSetup }
  ) => (
    <PageBody>
      {fromSetup ? (
        <BackToSetupLink className="mb-3 block w-fit font-sans text-xs font-semibold text-ink2 no-underline hover:text-ink" />
      ) : null}
      <PeopleManagementShell
        data={data}
        pipeline={pipeline}
        needsContactProfileIds={needsContactProfileIds}
        isSuperAdmin={isSuperAdmin}
      />
    </PageBody>
  ),
});
