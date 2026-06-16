import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { PeopleManagementShell } from "@/components/admin/people-management-shell";
import { requireAdmin } from "@/lib/auth/session";
import { isSuperAdminRole } from "@/lib/auth/roles";
import { currentUtcDateIso } from "@/lib/supabase/read-models";
import { loadPeoplePageData } from "@/components/admin/people/people-data";
import {
  BackToSetupLink,
  isFromSetup,
} from "@/components/lg/admin/back-to-setup-link";

export const dynamic = "force-dynamic";

type SearchParams = { from?: string | string[] };

export default async function AdminPeoplePage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const session = await requireAdmin();
  const isSuperAdmin = isSuperAdminRole(session.profile.role);
  const today = currentUtcDateIso();
  const fromSetup = isFromSetup((await searchParams)?.from);

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
    </>
  );
}
