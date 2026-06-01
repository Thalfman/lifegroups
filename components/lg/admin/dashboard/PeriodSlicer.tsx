import Link from "next/link";
import { P, fontSans } from "@/lib/pastoral";
import {
  OVERVIEW_GRAINS,
  overviewGrainChip,
  type OverviewGrain,
} from "@/lib/admin/overview-period";

// Week / month / quarter / year / all-time slicer for the activity band. Plain
// links (no client JS) — selecting a grain sets ?period= and re-renders the
// server page; all-time links to the bare /admin for a clean default URL.
export function PeriodSlicer({ current }: { current: OverviewGrain }) {
  return (
    <div
      role="group"
      aria-label="Activity period"
      style={{
        display: "inline-flex",
        flexWrap: "wrap",
        gap: 3,
        background: P.bg,
        border: `1px solid ${P.line}`,
        borderRadius: 999,
        padding: 3,
      }}
    >
      {OVERVIEW_GRAINS.map((grain) => {
        const active = grain === current;
        return (
          <Link
            key={grain}
            href={grain === "all" ? "/admin" : `/admin?period=${grain}`}
            aria-current={active ? "true" : undefined}
            style={{
              padding: "5px 12px",
              borderRadius: 999,
              fontFamily: fontSans,
              fontSize: 12,
              fontWeight: 600,
              textDecoration: "none",
              background: active ? P.surface : "transparent",
              color: active ? P.ink : P.ink3,
              border: `1px solid ${active ? P.line : "transparent"}`,
            }}
          >
            {overviewGrainChip(grain)}
          </Link>
        );
      })}
    </div>
  );
}
