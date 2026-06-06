import Link from "next/link";
import { P, fontDisplay, fontBody } from "@/lib/pastoral";
import { Icon, type IconName } from "@/components/lg/Icon";
import type { HubTile } from "@/lib/auth/hub-tiles";
import type { HubStat } from "@/lib/home/hub-stats";

// The authenticated Home Hub launcher. Tiles are navigation-only by contract
// (#158): every tile is a plain Link with no per-request data fetching. The hub
// now also paints an optional at-a-glance live-stats band above the tiles
// (CONTEXT.md). Stats are resolved upstream (lib/home/hub-stats) and passed in;
// when none are supplied the band is omitted and the surface stays a pure
// launcher, so the tiles-only contract still holds.
export function HomeHub({
  tiles,
  stats = [],
}: {
  tiles: HubTile[];
  stats?: HubStat[];
}) {
  return (
    <div style={{ display: "grid", gap: 24 }}>
      {stats.length > 0 ? <HubStatsBand stats={stats} /> : null}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 16,
        }}
      >
        {tiles.map((tile) => (
          <Link
            key={tile.href}
            href={tile.href}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "20px 22px",
              background: P.surface,
              border: `1px solid ${P.line}`,
              borderRadius: 16,
              textDecoration: "none",
              color: P.ink,
            }}
          >
            <span
              aria-hidden
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 40,
                height: 40,
                borderRadius: 12,
                background: P.bg,
                border: `1px solid ${P.line}`,
                color: P.terra,
                flexShrink: 0,
              }}
            >
              <Icon name={tile.icon as IconName} size={20} />
            </span>
            <span
              style={{
                fontFamily: fontDisplay,
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: -0.2,
              }}
            >
              {tile.label}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// A compact band of at-a-glance figures (active groups, people in groups,
// follow-ups due). Read-only orientation, not controls — it sets context before
// the operator chooses a tile. Each figure is supplied only when its read
// succeeded, so the band silently scales to whatever loaded.
function HubStatsBand({ stats }: { stats: HubStat[] }) {
  return (
    <dl
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: 16,
        margin: 0,
      }}
    >
      {stats.map((stat) => (
        <div
          key={stat.label}
          style={{
            background: P.surface,
            border: `1px solid ${P.line}`,
            borderRadius: 16,
            padding: "16px 20px",
          }}
        >
          <dt
            style={{
              fontFamily: fontBody,
              fontSize: 12,
              letterSpacing: 0.3,
              textTransform: "uppercase",
              color: P.ink3,
              margin: 0,
            }}
          >
            {stat.label}
          </dt>
          <dd
            style={{
              fontFamily: fontDisplay,
              fontSize: 30,
              fontWeight: 600,
              color: P.ink,
              margin: "6px 0 0",
              lineHeight: 1,
            }}
          >
            {stat.value.toLocaleString()}
          </dd>
        </div>
      ))}
    </dl>
  );
}
