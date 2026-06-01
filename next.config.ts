import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
