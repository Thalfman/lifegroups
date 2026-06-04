import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Client-side Router Cache window so navigating between admin surfaces —
    // and back/forward — renders the already-fetched RSC payload instantly
    // instead of re-running the server read on every visit. The sidebar links
    // use `prefetch={true}` (see Sidebar.tsx) to warm each tab's full payload —
    // data included — while idle, and this window keeps those prefetched
    // payloads valid long enough that bouncing between tabs is consistently
    // instant with no skeleton flash. The window also throttles re-prefetching
    // to ~once per window rather than once per page load.
    //
    // Freshness is preserved where it matters: every mutation flows through
    // `runAdminWriteAction` → `revalidatePath`, which busts this cache for the
    // affected path, so a care/health/follow-up edit is reflected on the next
    // visit. Only a *passive* revisit (no write) within the window can show
    // data up to `dynamic` seconds stale — the accepted tradeoff for instant
    // navigation (see the loading decision; care data is the sensitive case).
    staleTimes: {
      dynamic: 300,
      static: 300,
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
