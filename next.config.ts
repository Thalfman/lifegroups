import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: repoRoot,
  experimental: {
    // Short client-side Router Cache so navigating between admin surfaces —
    // and back/forward — renders the already-fetched RSC payload instantly
    // instead of re-running the server read on every visit. Combined with the
    // shared admin `loading.tsx` skeleton, a sidebar click commits immediately
    // rather than after a fetch round-trip.
    //
    // The "instant on every click" behaviour comes from the sidebar links'
    // `prefetch={true}` (see Sidebar.tsx), which warms each tab's full payload
    // before it's clicked — NOT from a long cache window. So this window is
    // deliberately kept short: a longer one would widen the period in which a
    // prefetched payload is served with no server round-trip, broadening both
    // stale-data and revoked-access exposure without improving perceived speed.
    //
    // Freshness is preserved where it matters: every mutation flows through
    // `runAdminWriteAction` → `revalidatePath`, which busts this cache for the
    // affected path, so a care/health/follow-up edit is reflected on the next
    // visit. Only a *passive* revisit (no write) within the window can show
    // data up to `dynamic` seconds stale — the accepted tradeoff for instant
    // navigation (see the loading decision; care data is the sensitive case).
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  // ADR 0010 surface-budget consolidation: the Capacity board and Multiplication
  // surfaces were folded into Launch planning. Keep saved links / bookmarks
  // resolving by redirecting the retired routes to the merged surface.
  async redirects() {
    return [
      {
        source: "/admin/capacity-board",
        destination: "/admin/launch-planning",
        permanent: true,
      },
      {
        source: "/admin/multiplication",
        destination: "/admin/launch-planning",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
