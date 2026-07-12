import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { fetchGroupAttendanceWeeksForGroups } from "@/lib/supabase/attendance-reads";
import type { ReadClient } from "@/lib/supabase/read-core";

const MIGRATION = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260718020000_group_health_bulk_attendance_read.sql"
  ),
  "utf8"
).toLowerCase();

describe("Group Health bulk attendance read", () => {
  it("ranks a bounded recent window per group in one RLS-respecting RPC", () => {
    expect(MIGRATION).toContain(
      "create or replace function public.admin_group_health_attendance_weeks"
    );
    expect(MIGRATION).toContain("partition by s.group_id");
    expect(MIGRATION).toContain("left join public.attendance_records");
    expect(MIGRATION).toContain("security invoker");
    expect(MIGRATION).toContain("set search_path = ''");
    expect(MIGRATION).toContain("from public, anon");
    expect(MIGRATION).toContain("to authenticated");
  });

  it("calls the bulk RPC once and normalizes aggregate counts", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          group_id: "g1",
          session_id: "s1",
          meeting_week: "2026-07-06",
          present: "3",
          absent: "1",
          excused: "0",
        },
      ],
      error: null,
    }));
    const client = { rpc } as unknown as ReadClient;

    const result = await fetchGroupAttendanceWeeksForGroups(
      client,
      ["g1", "g2"],
      8
    );

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("admin_group_health_attendance_weeks", {
      p_group_ids: ["g1", "g2"],
      p_limit_weeks: 8,
    });
    expect(result).toEqual({
      data: [
        {
          group_id: "g1",
          session_id: "s1",
          meeting_week: "2026-07-06",
          present: 3,
          absent: 1,
          excused: 0,
        },
      ],
      error: null,
    });
  });
});
