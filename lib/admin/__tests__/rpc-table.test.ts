import { describe, expect, it, vi } from "vitest";

import { adminRpc, adminJsonRpc, adminTextRpc } from "@/lib/admin/rpc";
import { leaderRpc } from "@/lib/leader/rpc";
import { overShepherdRpc } from "@/lib/over-shepherd/rpc";
import type { AppSupabaseClient } from "@/lib/supabase/types";

const UUID = "11111111-1111-1111-1111-111111111111";

function clientReturning(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => result);
  return { client: { rpc } as unknown as AppSupabaseClient, rpc };
}

// A representative slice of the uuid-channel table: simple-args, named-alias
// args, no-arg ({}), and the one purpose-named RPC outside the admin_* /
// super_admin_* families.
const UUID_CASES = [
  {
    name: "admin_create_group_category",
    args: { p_label: "Young Families" },
  },
  {
    name: "admin_close_group",
    args: { p_group_id: UUID },
  },
  {
    name: "admin_write_care_note",
    args: { p_subject_profile_id: UUID, p_body: "Checked in after surgery." },
  },
  {
    name: "set_note_transparency_grant",
    args: { p_subject_profile_id: UUID, p_granted: true },
  },
  {
    name: "super_admin_clean_slate_wipe",
    args: {},
  },
  {
    name: "admin_reset_metric_defaults",
    args: {},
  },
] as const;

describe("adminRpc — the uuid-channel table", () => {
  it.each(UUID_CASES)(
    "forwards the literal name + args for $name",
    async ({ name, args }) => {
      const { client, rpc } = clientReturning({ data: UUID, error: null });

      await adminRpc(client, name, args);

      expect(rpc).toHaveBeenCalledWith(name, args);
    }
  );

  it("uuid-validates the returned data and lowercases it", async () => {
    const upper = "ABCDEF12-3456-7890-ABCD-EF1234567890";
    const { client } = clientReturning({ data: upper, error: null });

    const result = await adminRpc(client, "admin_close_group", {
      p_group_id: UUID,
    });

    expect(result).toEqual({ data: upper.toLowerCase(), error: null });
  });

  it("returns null data when the RPC yields a non-uuid value", async () => {
    const { client } = clientReturning({ data: "3", error: null });

    const result = await adminRpc(client, "admin_close_group", {
      p_group_id: UUID,
    });

    expect(result.data).toBeNull();
  });

  it("surfaces the PostgrestError untouched", async () => {
    const error = { message: "insufficient_privilege" };
    const { client } = clientReturning({ data: null, error });

    const result = await adminRpc(client, "admin_close_group", {
      p_group_id: UUID,
    });

    expect(result).toEqual({ data: null, error });
  });
});

const JSON_CASES = [
  { name: "super_admin_reset_activity", args: {} },
  { name: "super_admin_clear_activity_reset", args: {} },
  {
    name: "super_admin_permanent_delete_preflight",
    args: { p_entity_type: "member", p_id: UUID },
  },
  {
    name: "super_admin_restore_tombstone",
    args: { p_tombstone_id: UUID },
  },
] as const;

describe("adminJsonRpc — the jsonb-channel table", () => {
  it.each(JSON_CASES)(
    "forwards the literal name + args for $name",
    async ({ name, args }) => {
      const { client, rpc } = clientReturning({ data: null, error: null });

      await adminJsonRpc(client, name, args);

      expect(rpc).toHaveBeenCalledWith(name, args);
    }
  );

  it("passes a structured jsonb document through untouched", async () => {
    const report = { blockers: [], set_null: [{ table: "members", count: 2 }] };
    const { client } = clientReturning({ data: report, error: null });

    const result = await adminJsonRpc(
      client,
      "super_admin_permanent_delete_preflight",
      { p_entity_type: "member", p_id: UUID }
    );

    expect(result).toEqual({ data: report, error: null });
  });
});

describe("adminTextRpc — the text-channel table", () => {
  it("forwards the literal name + args and keeps a non-uuid string", async () => {
    const { client, rpc } = clientReturning({ data: "3", error: null });
    const args = { p_rows: [{ full_name: "Ana" }] };

    const result = await adminTextRpc(
      client,
      "super_admin_bulk_import_people",
      args
    );

    expect(rpc).toHaveBeenCalledWith("super_admin_bulk_import_people", args);
    expect(result).toEqual({ data: "3", error: null });
  });

  it("returns null data when the driver yields a non-string", async () => {
    const { client } = clientReturning({ data: 3, error: null });

    const result = await adminTextRpc(
      client,
      "super_admin_bulk_import_people",
      { p_rows: [] }
    );

    expect(result.data).toBeNull();
  });
});

describe("leaderRpc / overShepherdRpc — the per-surface uuid tables", () => {
  it("forwards the literal name + args for leader_update_follow_up_status", async () => {
    const { client, rpc } = clientReturning({ data: UUID, error: null });
    const args = { p_follow_up_id: UUID, p_status: "done" as const };

    await leaderRpc(client, "leader_update_follow_up_status", args);

    expect(rpc).toHaveBeenCalledWith("leader_update_follow_up_status", args);
  });

  it("forwards the literal name + args for over_shepherd_log_broad_note", async () => {
    const { client, rpc } = clientReturning({ data: UUID, error: null });
    const args = { p_shepherd_profile_id: UUID, p_note: "Doing well." };

    await overShepherdRpc(client, "over_shepherd_log_broad_note", args);

    expect(rpc).toHaveBeenCalledWith("over_shepherd_log_broad_note", args);
  });

  it("applies the uuid trust-boundary read on the leader channel", async () => {
    const { client } = clientReturning({ data: "not-a-uuid", error: null });

    const result = await leaderRpc(client, "leader_update_follow_up_status", {
      p_follow_up_id: UUID,
      p_status: "done",
    });

    expect(result.data).toBeNull();
  });
});
