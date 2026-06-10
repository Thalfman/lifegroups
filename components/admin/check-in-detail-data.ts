import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildCheckInDetailData,
  emptyCheckInDetail,
  supabaseCheckInDetailReads,
  type CheckInDetailResult,
} from "@/lib/admin/check-ins";

// Binds the live client and runs the pure buildCheckInDetailData assembly
// (ADR 0015), so the calling page stays guard → load → shell. The seam
// interface, adapter, and build live in lib/admin/check-ins.ts next to the
// shared check-in derivations; only this loader touches the server client —
// keeping it out of that module so the client-side detail shell can keep
// importing the formatters and types from there.
export async function loadCheckInDetailData(options: {
  groupId: string;
  meetingWeek: string;
}): Promise<CheckInDetailResult> {
  const client = await createSupabaseServerClient();
  if (!client) {
    return {
      kind: "ok",
      data: emptyCheckInDetail(
        options.groupId,
        options.meetingWeek,
        "The database is not configured in this environment."
      ),
    };
  }
  return buildCheckInDetailData(supabaseCheckInDetailReads(client), options);
}
