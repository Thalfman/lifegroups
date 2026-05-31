import Link from "next/link";
import { P, fontDisplay } from "@/lib/pastoral";
import { Icon, type IconName } from "@/components/lg/Icon";
import type { HubTile } from "@/lib/auth/hub-tiles";

// The authenticated Home Hub launcher. Tiles-only by contract (#158): every
// tile is a plain navigation Link, no per-request data fetching. The tile set
// is decided upstream by hubTilesForRole; this component only paints it.
export function HomeHub({ tiles }: { tiles: HubTile[] }) {
  return (
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
  );
}
