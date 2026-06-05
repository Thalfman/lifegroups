import type { ReactNode } from "react";
import { requireLeader } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

// Leader route-group guard (#376, ADR 0017 amending ADR 0002 / under ADR 0009).
//
// The whole /leader/** tree is gated by requireLeader(), which now owns the
// verify-before-flip check: it admits an active leader / co_leader ONLY when the
// `leader_surface` frozen-surface flag resolves enabled-and-verified, via the
// leader-SAFE read_frozen_surface_flag RPC. Every other role, and any leader
// while the surface is not live, is redirected to /unauthorized.
//
// This replaces the earlier frozenSurfaceGate(isFrozenSurfaceLive) wrapper:
// isFrozenSurfaceLive reads the ADMIN-only admin_read_feature_flags RPC, which
// returns an empty map to a leader, so it could never see leader_surface as live
// from a leader context. The gate now lives in the guard with a leader-safe read.
//
// Check-ins are NOT covered by this gate: /leader/[groupId]/checkin carries its
// own independent `check_ins` frozen gate (which stays off), so a live
// leader_surface never re-exposes the check-in route.
export default async function LeaderLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireLeader();
  return <>{children}</>;
}
