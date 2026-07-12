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
    const range = vi.fn(async () => ({
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
    const rpc = vi.fn(() => ({ range }));
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
    expect(range).toHaveBeenCalledWith(0, 15);
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

  it("pages the RPC result beyond PostgREST's default response cap", async () => {
    const rows = Array.from({ length: 1_008 }, (_, index) => ({
      group_id: `g${Math.floor(index / 8)}`,
      session_id: `s${index}`,
      meeting_week: "2026-07-06",
      present: "3",
      absent: "1",
      excused: "0",
    }));
    const range = vi.fn(async (from: number, to: number) => ({
      data: rows.slice(from, to + 1),
      error: null,
    }));
    const rpc = vi.fn(() => ({ range }));
    const client = { rpc } as unknown as ReadClient;
    const groupIds = Array.from({ length: 126 }, (_, index) => `g${index}`);

    const result = await fetchGroupAttendanceWeeksForGroups(
      client,
      groupIds,
      8
    );

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(range).toHaveBeenNthCalledWith(1, 0, 999);
    expect(range).toHaveBeenNthCalledWith(2, 1_000, 1_007);
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1_008);
    expect(result.data?.at(-1)).toEqual({
      group_id: "g125",
      session_id: "s1007",
      meeting_week: "2026-07-06",
      present: 3,
      absent: 1,
      excused: 0,
    });
  });
});
