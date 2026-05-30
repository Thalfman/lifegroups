import { describe, expect, it } from "vitest";

import { fetchFollowUpsForAdmin } from "@/lib/supabase/read-models";
import type { AppSupabaseClient } from "@/lib/supabase/types";

// Captures the column allowlist passed to `.select(...)`. The admin
// follow-ups reader is the one place admin_private_note is read, so the
// test pins that the allowlist exposes it *by design* while still keeping
// audit columns behind the seam.
function makeClient(rows: unknown[]) {
  let selectArg = "";
  const builder: Record<string, unknown> = {
    select: (cols: string) => {
      selectArg = cols;
      return builder;
    },
    order: () => builder,
    in: () => builder,
    limit: () => builder,
    range: () => builder,
    returns: () => builder,
    then: (onF: (v: unknown) => unknown, onR: (e: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(onF, onR),
  };
  const client = { from: () => builder } as unknown as AppSupabaseClient;
  return { client, select: () => selectArg };
}

describe("fetchFollowUpsForAdmin — admin read-model seam", () => {
  it("selects an explicit allowlist that includes admin_private_note by design", async () => {
    const { client, select } = makeClient([]);
    await fetchFollowUpsForAdmin(client);
    const cols = select();
    expect(cols).not.toBe("*");
    expect(cols).toContain("admin_private_note");
    expect(cols).toContain("leader_visible_note");
  });

  it("keeps audit / mutation columns behind the seam", async () => {
    const { client, select } = makeClient([]);
    await fetchFollowUpsForAdmin(client);
    const cols = select();
    for (const audit of ["updated_at", "completed_at", "created_by", "updated_by"]) {
      expect(cols).not.toContain(audit);
    }
  });
});
