import { requireAdmin } from "@/lib/auth/session";
import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { P, fontBody } from "@/lib/pastoral";
import { loadMultiplyData } from "@/components/admin/multiply/multiply-data";
import { MultiplyBoards } from "@/components/admin/multiply/multiply-boards";

// Multiply area (ADR 0016 / 0019, #380). Three boards by group type (Men's /
// Women's / Mixed), each scored by four pillars (Capacity, Interest, Group
// Health, Leader Health) and a Julian-owned trigger that produces a "ready to
// multiply this type" signal — by type, not by a single blended letter. Capacity
// is fed by the Ministry Admin in Settings; Interest derives from the Interest
// Funnel; the two health pillars roll up the ministry-year grades (showing "—"
// until the parallel grade slices #377/#378 land). A full group can raise its own
// "multiply this one" flag from the Capacity input.
export const dynamic = "force-dynamic";

export default async function AdminMultiplyPage() {
  await requireAdmin();
  const data = await loadMultiplyData();

  return (
    <>
      <PageHeader
        eyebrow="Multiply"
        title="When to"
        italic="multiply"
        lede="Which group types are ready to multiply — by type, not by individual group."
      />
      <PageBody>
        {data.error ? (
          <p
            style={{
              fontFamily: fontBody,
              fontSize: 14,
              color: P.terraTextStrong,
            }}
          >
            {data.error}
          </p>
        ) : (
          <MultiplyBoards
            boards={data.boards}
            ministryYear={data.ministryYear}
          />
        )}
      </PageBody>
    </>
  );
}
