import { PageBody, PageHeader } from "@/components/lg/PageHeader";
import { ShepherdCareDirectoryTable } from "@/components/admin/shepherd-care/directory-table";
import {
  ShepherdCareFilterChips,
  type DirectoryFilter,
} from "@/components/admin/shepherd-care/filter-chips";
import { requireAdmin } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  fetchShepherdCareDirectoryForAdmin,
  type ShepherdCareDirectoryEntry,
} from "@/lib/supabase/read-models";
import { P, fontBody } from "@/lib/pastoral";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function resolveFilter(value: string | string[] | undefined): DirectoryFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "needs_attention" ? "needs_attention" : "all";
}

async function loadEntries(): Promise<{
  entries: ShepherdCareDirectoryEntry[];
  error: string | null;
}> {
  const client = await createSupabaseServerClient();
  if (!client) {
    return { entries: [], error: "Database is not configured in this environment." };
  }
  const result = await fetchShepherdCareDirectoryForAdmin(client);
  if (result.error) return { entries: [], error: result.error.message };
  return { entries: result.data, error: null };
}

export default async function AdminShepherdCarePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();

  const sp = await searchParams;
  const filter = resolveFilter(sp.filter);

  const { entries, error } = await loadEntries();
  const needsAttentionCount = entries.filter((e) => e.needs_attention).length;
  const visible =
    filter === "needs_attention" ? entries.filter((e) => e.needs_attention) : entries;

  return (
    <>
      <PageHeader
        eyebrow="Shepherd care"
        title="Shepherd"
        italic="care"
        lede="Track leader and co-leader care: recent connections, next touchpoints, and current care status. Admin-only — care notes never leave this surface."
      />
      <PageBody>
        <div style={{ display: "grid", gap: 18 }}>
          <ShepherdCareFilterChips
            current={filter}
            totalCount={entries.length}
            needsAttentionCount={needsAttentionCount}
          />
          {error ? (
            <p
              style={{
                fontFamily: fontBody,
                color: "#923220",
                background: P.terraSoft,
                padding: "10px 14px",
                borderRadius: 8,
                margin: 0,
              }}
            >
              {error}
            </p>
          ) : null}
          <ShepherdCareDirectoryTable entries={visible} />
        </div>
      </PageBody>
    </>
  );
}
