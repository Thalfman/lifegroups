// Read-layer bridge for the Over-Shepherd login tier
// (docs/adr/0002-oversight-ladder-and-leader-gating.md).
//
// Resolves the current Over-Shepherd identity + the set of Shepherd profile
// ids they actively cover, by calling the SECURITY DEFINER
// `over_shepherd_caller_coverage()` RPC. The email-collision policy (require a
// single active roster match; zero/ambiguous => no access) and the
// active-only coverage filter live in SQL; this helper just consumes and
// shape-validates the result so the surface slices can drive their reads.

import type { AppSupabaseClient } from "@/lib/supabase/types";
import { isUuid } from "@/lib/shared/uuid";

export type OverShepherdCoverage = {
  overShepherdId: string;
  coveredShepherdIds: string[];
};

// Defense-in-depth membership check for the per-Shepherd page: even though
// RLS scopes the underlying rows, the route should refuse to render a
// Shepherd the caller doesn't cover rather than leaning on an empty result.
export function isCoveredShepherd(
  coverage: OverShepherdCoverage | null,
  shepherdProfileId: string
): boolean {
  if (coverage === null) return false;
  return coverage.coveredShepherdIds.includes(shepherdProfileId);
}

// `data: null` here means a clean no-access resolution (zero or ambiguous
// roster match), NOT an error. `error` is reserved for transient backend
// failures so callers can distinguish "you have no coverage scope" from
// "the lookup failed".
export type CoverageResult =
  | { data: OverShepherdCoverage | null; error: null }
  | { data: null; error: Error };

function isCoverageShape(v: unknown): v is {
  over_shepherd_id: string;
  covered_shepherd_ids: string[];
} {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  if (!isUuid(r.over_shepherd_id)) return false;
  if (!Array.isArray(r.covered_shepherd_ids)) return false;
  return r.covered_shepherd_ids.every((id): id is string => isUuid(id));
}

export async function fetchOverShepherdCoverageForCaller(
  client: AppSupabaseClient | null
): Promise<CoverageResult> {
  if (!client) {
    return { data: null, error: new Error("Database is not configured.") };
  }

  const result = await client.rpc("over_shepherd_caller_coverage" as never);
  const error = result.error as { message: string } | null;
  const data: unknown = result.data;

  if (error) {
    return {
      data: null,
      error: new Error(`over_shepherd_caller_coverage: ${error.message}`),
    };
  }

  // NULL from the RPC => no access (zero or ambiguous match). This is a
  // valid, non-error outcome.
  if (data == null) {
    return { data: null, error: null };
  }

  if (!isCoverageShape(data)) {
    return {
      data: null,
      error: new Error(
        "over_shepherd_caller_coverage: response failed shape validation"
      ),
    };
  }

  return {
    data: {
      overShepherdId: data.over_shepherd_id,
      coveredShepherdIds: [...data.covered_shepherd_ids],
    },
    error: null,
  };
}
