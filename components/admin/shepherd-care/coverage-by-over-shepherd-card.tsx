import Link from "next/link";
import { StatusCard } from "@/components/dashboard/cards";
import { P, fontBody, fontSans } from "@/lib/pastoral";
import type { CareCoverageBucket } from "@/lib/admin/shepherd-care-dashboard";

const tileStyle = {
  background: P.bgDeep,
  border: `1px solid ${P.line2}`,
  borderRadius: 8,
  padding: "10px 12px",
  display: "grid" as const,
  gap: 4,
  textDecoration: "none",
  color: "inherit",
};

export function CoverageByOverShepherdCard({
  buckets,
}: {
  buckets: CareCoverageBucket[];
}) {
  const namedBuckets = buckets.filter((b) => !b.isUnassigned);
  const unassigned = buckets.find((b) => b.isUnassigned);

  return (
    <StatusCard
      eyebrow="Coverage"
      title="By over-shepherd"
      action={
        <Link
          href="/admin/shepherd-care/over-shepherds"
          style={{ color: "inherit", textDecoration: "none" }}
        >
          Manage →
        </Link>
      }
    >
      {namedBuckets.length === 0 ? (
        <p
          style={{
            fontFamily: fontBody,
            fontSize: 13,
            color: P.ink2,
            margin: "0 0 12px",
            fontStyle: "italic",
          }}
        >
          No over-shepherds yet. Add a coach to start tracking coverage.
        </p>
      ) : null}
      <div
        className="lg-m-grid-stack"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 10,
        }}
      >
        {namedBuckets.map((bucket) => (
          <Link key={bucket.overShepherdId ?? "unassigned"} href={bucket.href} style={tileStyle}>
            <div
              style={{
                fontFamily: fontSans,
                fontSize: 13,
                color: P.ink,
                fontWeight: 600,
                overflowWrap: "anywhere",
              }}
            >
              {bucket.overShepherdName}
            </div>
            <div style={{ fontFamily: fontBody, fontSize: 12, color: P.ink3 }}>
              {bucket.shepherdCount} shepherd{bucket.shepherdCount === 1 ? "" : "s"}
            </div>
          </Link>
        ))}
        {unassigned ? (
          // Always render the Unassigned tile, even in the bootstrap state with
          // zero over-shepherds — it's the only in-card entry point into the
          // unassigned-coverage filter, and exactly the case where it matters.
          <Link href={unassigned.href} style={tileStyle}>
            <div
              style={{
                fontFamily: fontSans,
                fontSize: 13,
                color: P.ink,
                fontWeight: 600,
              }}
            >
              {unassigned.overShepherdName}
            </div>
            <div style={{ fontFamily: fontBody, fontSize: 12, color: P.ink3 }}>
              {unassigned.shepherdCount} shepherd{unassigned.shepherdCount === 1 ? "" : "s"}
            </div>
          </Link>
        ) : null}
      </div>
    </StatusCard>
  );
}
