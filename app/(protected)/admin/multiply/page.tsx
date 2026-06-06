import { requireAdmin } from "@/lib/auth/session";
import { PageHeader, PageBody } from "@/components/lg/PageHeader";
import { P, fontBody } from "@/lib/pastoral";
import { loadMultiplyGridData } from "@/components/admin/multiply/multiply-grid-data";
import { MultiplyGridView } from "@/components/admin/multiply/multiply-grid";

// Multiply area (ADR 0016 / 0019, #403). A single category×type matrix grid: rows
// are categories, columns are the three top types (Men's / Women's / Mixed). Each
// active cell carries a per-cell readiness signal (the recast natural-unit rule,
// #402) and its `have X of Y` coverage (#400). Cells where a category isn't applied
// to a type render blank. This grid folds in the old three per-type boards — the
// per-cell signal now lives on the individual cell where the issue belongs.
export const dynamic = "force-dynamic";

export default async function AdminMultiplyPage() {
  await requireAdmin();
  const data = await loadMultiplyGridData();

  return (
    <>
      <PageHeader
        eyebrow="Multiply"
        title="When to"
        italic="multiply"
        lede="Which cells are ready to multiply — by category and top type."
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
          <MultiplyGridView grid={data.grid} ministryYear={data.ministryYear} />
        )}
      </PageBody>
    </>
  );
}
