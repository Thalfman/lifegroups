import { describe, expect, it } from "vitest";

import { fetchGuests } from "@/lib/supabase/read-models";
import type { AppSupabaseClient } from "@/lib/supabase/types";

// Captures the column allowlist passed to `.select(...)` and resolves to
// fixture rows. Mirrors the thenable query-builder mock used across the
// read-model tests (no DB).
function makeClient(rows: unknown[]) {
  let selectArg = "";
  const builder: Record<string, unknown> = {
    select: (cols: string) => {
      selectArg = cols;
      return builder;
    },
    order: () => builder,
    range: () => builder,
    returns: () => builder,
    then: (onF: (v: unknown) => unknown, onR: (e: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(onF, onR),
  };
  const client = {
    from: () => builder,
  } as unknown as AppSupabaseClient;
  return { client, select: () => selectArg };
}

describe("fetchGuests — directory read-model seam", () => {
  it("selects an explicit column allowlist, never select(*)", async () => {
    const { client, select } = makeClient([]);
    await fetchGuests(client);
    const cols = select();
    expect(cols).not.toBe("*");
    expect(cols).toContain("full_name");
    expect(cols).toContain("pipeline_stage");
  });

  it("keeps audit / mutation columns behind the seam", async () => {
    const { client, select } = makeClient([]);
    await fetchGuests(client);
    const cols = select();
    // These exist on the table but the directory surface never renders
    // them; they must not cross the read seam.
    for (const audit of ["updated_at", "created_by", "updated_by"]) {
      expect(cols).not.toContain(audit);
    }
  });

  it("returns the rows the directory renders", async () => {
    const entry = {
      id: "11111111-1111-1111-1111-111111111111",
      full_name: "Skyler Reed",
      email: "skyler@example.com",
      phone: null,
      first_attended_group_id: null,
      first_attended_date: null,
      pipeline_stage: "new",
      assigned_group_id: null,
      follow_up_owner_id: null,
      notes: null,
      created_at: "2026-05-01T00:00:00Z",
    };
    const { client } = makeClient([entry]);
    const result = await fetchGuests(client);
    expect(result.error).toBeNull();
    expect(result.data).toEqual([entry]);
  });
});
