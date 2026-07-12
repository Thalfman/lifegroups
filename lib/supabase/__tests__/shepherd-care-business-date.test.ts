import { afterEach, describe, expect, it, vi } from "vitest";

import { buildCareDirectoryEntries } from "@/lib/supabase/shepherd-care-directory-reads";

afterEach(() => {
  vi.useRealTimers();
});

describe("Care directory business date", () => {
  it("does not mark a touchpoint overdue before the church-local day rolls over", () => {
    vi.useFakeTimers();
    // 2026-07-07 22:30 in Chicago, but already 2026-07-08 in UTC.
    vi.setSystemTime(new Date("2026-07-08T03:30:00Z"));

    const [entry] = buildCareDirectoryEntries(
      [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          full_name: "Jordan Shepherd",
          email: "jordan@example.test",
          role: "leader",
          status: "active",
        } as never,
      ],
      [
        {
          shepherd_profile_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          current_status: "doing_well",
          last_contact_at: "2026-07-07",
          next_touchpoint_due: "2026-07-07",
        } as never,
      ]
    );

    expect(entry.needs_attention).toBe(false);
  });
});
