import { describe, expect, it, vi } from "vitest";

import { leaderRpc, type LeaderUuidRpcArgs } from "@/lib/leader/rpc";
import type { AppSupabaseClient } from "@/lib/supabase/types";

const UUID = "11111111-1111-1111-1111-111111111111";

function clientReturning(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => result);
  return { client: { rpc } as unknown as AppSupabaseClient, rpc };
}

// One case per leader RPC, covering the FULL arg-key shape each wrapper
// sends. A renamed Postgres function or a changed arg key must update this
// registry, mirroring lib/over-shepherd/__tests__/rpc.test.ts (#868).
const UUID_CASES: {
  [K in keyof LeaderUuidRpcArgs]: { name: K; args: LeaderUuidRpcArgs[K] };
}[keyof LeaderUuidRpcArgs][] = [
  {
    name: "leader_submit_group_checkin",
    args: {
      p_group_id: UUID,
      p_meeting_week: "2026-07-06",
      p_meeting_date: "2026-07-08",
      p_status: "submitted",
      p_leader_note: "Great turnout.",
      p_pulse: "healthy",
      p_follow_up_needed: false,
      p_attendance: [{ member_id: UUID, attendance_status: "present" }],
    },
  },
  {
    name: "leader_update_follow_up_status",
    args: { p_follow_up_id: UUID, p_status: "done" },
  },
  {
    name: "leader_create_group_calendar_event",
    args: {
      p_group_id: UUID,
      p_event_date: "2026-07-15",
      p_start_time: "18:30",
      p_end_time: "20:00",
      p_event_type: "study",
      p_status: "scheduled",
      p_title: "Weekly gathering",
      p_description: null,
    },
  },
  {
    name: "leader_update_group_calendar_event",
    args: {
      p_event_id: UUID,
      p_event_date: "2026-07-15",
      p_start_time: null,
      p_end_time: null,
      p_event_type: "social",
      p_status: "off",
      p_title: null,
      p_description: null,
    },
  },
  {
    name: "leader_archive_group_calendar_event",
    args: { p_event_id: UUID },
  },
  {
    name: "leader_restore_group_calendar_event",
    args: { p_event_id: UUID },
  },
  {
    name: "leader_write_group_care_note",
    args: { p_group_id: UUID, p_body: "Checked in with the group." },
  },
  {
    name: "leader_write_group_prayer_request",
    args: { p_group_id: UUID, p_body: "Pray for the group." },
  },
];

describe("leader RPC table pins the exact Postgres function name + args", () => {
  it("covers every RPC declared by the gateway", () => {
    // Keep the registry exhaustive: LeaderUuidRpcArgs typing above enforces
    // that each case's args match its RPC, and this count pins the total so
    // a new RPC cannot ship without a case here.
    expect(UUID_CASES).toHaveLength(8);
    expect(new Set(UUID_CASES.map((c) => c.name)).size).toBe(8);
  });

  it.each(UUID_CASES)(
    "$name passes through verbatim",
    async ({ name, args }) => {
      const { client, rpc } = clientReturning({ data: UUID, error: null });
      await leaderRpc(client, name, args);
      expect(rpc).toHaveBeenCalledWith(name, args);
    }
  );

  it("surfaces the RPC error message to the caller", async () => {
    const { client } = clientReturning({
      data: null,
      error: { message: "not_your_group" },
    });
    const r = await leaderRpc(client, "leader_write_group_care_note", {
      p_group_id: UUID,
      p_body: "x",
    });
    expect(r.error?.message).toBe("not_your_group");
    expect(r.data).toBeNull();
  });

  it("reads only a uuid back across the trust boundary", async () => {
    const { client } = clientReturning({
      data: { unexpected: "shape" },
      error: null,
    });
    const r = await leaderRpc(client, "leader_archive_group_calendar_event", {
      p_event_id: UUID,
    });
    expect(r.data).toBeNull();
  });
});
