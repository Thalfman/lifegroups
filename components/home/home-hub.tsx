import Link from "next/link";
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
    <div className="grid gap-6">
      {stats.length > 0 ? <HubStatsBand stats={stats} /> : null}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
        {tiles.map((tile) => (
          <Link
            key={tile.href}
            href={tile.href}
            className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface px-[22px] py-5 text-ink no-underline"
          >
            <span
              aria-hidden
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-line bg-bg text-clay"
            >
              <Icon name={tile.icon as IconName} size={20} />
            </span>
            <span className="font-display text-[16px] font-semibold tracking-[-0.2px]">
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
    <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-2xl border border-line bg-surface px-5 py-4"
        >
          <dt className="m-0 font-sans text-xs uppercase tracking-[0.3px] text-ink3">
            {stat.label}
          </dt>
          <dd className="mb-0 ml-0 mt-1.5 font-display text-3xl font-semibold leading-none text-ink">
            {stat.value.toLocaleString()}
          </dd>
        </div>
      ))}
    </dl>
  );
}
