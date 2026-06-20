"use server";

import {
  validateSetGroupTypeInPipelinePayload,
  type SetGroupTypeInPipelinePayload,
} from "@/lib/admin/validation";
import { type ActionResult } from "@/lib/admin/action-result";
import {
  runAdminWriteAction,
  type ActionInput,
  type AdminWriteActionSpec,
} from "@/lib/admin/run-action";
import { adminRpc } from "@/lib/admin/rpc";

// Multiply Pipeline (ADR 0030): add/remove a group type's pipeline intent. The
// audited admin_set_group_type_in_pipeline RPC upserts the type's config row and
// flips in_pipeline (removal = false, a soft audited flip — never a hard delete).
// Revalidating /admin/multiply refreshes the Pipeline tab's list of pipelined
// types.
const SET_IN_PIPELINE_SPEC: AdminWriteActionSpec<
  SetGroupTypeInPipelinePayload,
  { id: string }
> = {
  name: "admin.multiply.set_group_type_in_pipeline",
  keys: ["group_type", "in_pipeline"],
  validate: validateSetGroupTypeInPipelinePayload,
  fields: (_actor, value) => ({
    group_type: value.groupType,
    in_pipeline: value.inPipeline,
  }),
  rpc: (client, value) =>
    adminRpc(client, "admin_set_group_type_in_pipeline", {
      p_group_type: value.groupType,
      p_in_pipeline: value.inPipeline,
    }),
  revalidate: () => ["/admin/multiply"],
  noDataError: "The pipeline change wasn't saved. Please try again.",
};

export async function adminSetGroupTypeInPipeline(
  prev: ActionResult<{ id: string }> | undefined,
  input: ActionInput<SetGroupTypeInPipelinePayload>
): Promise<ActionResult<{ id: string }>> {
  return runAdminWriteAction(SET_IN_PIPELINE_SPEC, prev, input);
}
