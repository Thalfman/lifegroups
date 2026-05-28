import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireLeaderActor, mockCreateClient, mockRevalidatePath } = vi.hoisted(
  () => ({
    mockRequireLeaderActor: vi.fn(),
    mockCreateClient: vi.fn(),
    mockRevalidatePath: vi.fn(),
  }),
);

vi.mock("@/lib/auth/session", () => ({
  requireLeaderActor: mockRequireLeaderActor,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateClient,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

const logCalls: { level: "info" | "warn" | "error"; ctx: Record<string, unknown> }[] = [];
vi.mock("@/lib/observability/logger", () => ({
  log: {
    info: (ctx: Record<string, unknown>) => logCalls.push({ level: "info", ctx }),
    warn: (ctx: Record<string, unknown>) => logCalls.push({ level: "warn", ctx }),
    error: (ctx: Record<string, unknown>) => logCalls.push({ level: "error", ctx }),
  },
}));

import {
  runLeaderWriteAction,
  type LeaderWriteActionSpec,
} from "@/lib/leader/run-action";

const PROFILE_ID = "11111111-1111-1111-1111-111111111111";
const GROUP_ID = "22222222-2222-2222-2222-222222222222";
const NEW_ID = "33333333-3333-3333-3333-333333333333";

function authOk(assignedGroupIds = [GROUP_ID]) {
  return { ok: true as const, profileId: PROFILE_ID, assignedGroupIds };
}

type Payload = { group_id: string };

function baseSpec(
  overrides: Partial<LeaderWriteActionSpec<Payload, { id: string }>> = {},
): LeaderWriteActionSpec<Payload, { id: string }> {
  return {
    name: "leader.test.action",
    read: (input) => (input as Record<string, unknown>) ?? {},
    validate: (raw) =>
      typeof raw.group_id === "string" && raw.group_id.length > 0
        ? { ok: true, value: { group_id: raw.group_id } }
        : { ok: false, errors: ["group_id required"] },
    fields: (_actor, value) => ({ target_group_id: value.group_id }),
    rpc: vi.fn(async () => ({ data: NEW_ID, error: null })),
    revalidate: () => "/leader",
    noDataError: "nothing saved",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  logCalls.length = 0;
  mockRequireLeaderActor.mockResolvedValue(authOk());
  mockCreateClient.mockResolvedValue({ rpc: vi.fn() });
});

function lastLog() {
  return logCalls[logCalls.length - 1];
}

describe("runLeaderWriteAction", () => {
  it("returns the auth error and logs denied when the actor is rejected", async () => {
    mockRequireLeaderActor.mockResolvedValue({ ok: false, error: "sign in" });

    const result = await runLeaderWriteAction(baseSpec(), undefined, { group_id: GROUP_ID });

    expect(result).toEqual({ ok: false, errors: ["sign in"] });
    expect(lastLog().ctx).toMatchObject({ outcome: "denied", error_code: "auth_denied" });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("bails from the pre-validation guardRaw with a denied outcome", async () => {
    const spec = baseSpec({
      guardRaw: () => ({ ok: false, error: "not your group", code: "not_assigned" }),
      validate: vi.fn(),
    });

    const result = await runLeaderWriteAction(spec, undefined, { group_id: GROUP_ID });

    expect(result).toEqual({ ok: false, errors: ["not your group"] });
    expect(lastLog().ctx).toMatchObject({
      outcome: "denied",
      error_code: "not_assigned",
      actor_profile_id: PROFILE_ID,
    });
    expect(spec.validate).not.toHaveBeenCalled();
  });

  it("threads guardRaw fields into validation_failed and every later stage", async () => {
    const spec = baseSpec({
      guardRaw: () => ({ ok: true, fields: { target_group_id: GROUP_ID } }),
      validate: () => ({ ok: false, errors: ["bad"] }),
    });

    await runLeaderWriteAction(spec, undefined, {});

    expect(lastLog().ctx).toMatchObject({
      outcome: "fail",
      error_code: "validation_failed",
      actor_profile_id: PROFILE_ID,
      target_group_id: GROUP_ID,
    });
  });

  it("bails from the post-validation guard with its fields", async () => {
    const spec = baseSpec({
      guard: (_actor, value) => ({
        error: "not assigned",
        code: "not_assigned",
        fields: { target_group_id: value.group_id },
      }),
    });

    const result = await runLeaderWriteAction(spec, undefined, { group_id: GROUP_ID });

    expect(result).toEqual({ ok: false, errors: ["not assigned"] });
    expect(lastLog().ctx).toMatchObject({
      outcome: "denied",
      error_code: "not_assigned",
      actor_profile_id: PROFILE_ID,
      target_group_id: GROUP_ID,
    });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("fails closed when the supabase client is not configured", async () => {
    mockCreateClient.mockResolvedValue(null);

    const result = await runLeaderWriteAction(baseSpec(), undefined, { group_id: GROUP_ID });

    expect(result).toEqual({ ok: false, errors: ["Database is not configured."] });
    expect(lastLog().ctx).toMatchObject({
      outcome: "fail",
      error_code: "supabase_not_configured",
      actor_profile_id: PROFILE_ID,
      target_group_id: GROUP_ID,
    });
  });

  it("maps the RPC error token to the pastoral leader message", async () => {
    const spec = baseSpec({
      rpc: async () => ({ data: null, error: { message: "not_leader_of_group" } }),
    });

    const result = await runLeaderWriteAction(spec, undefined, { group_id: GROUP_ID });

    expect(result).toEqual({
      ok: false,
      errors: ["Only the assigned leader or co-leader can submit this group's check-in."],
    });
    expect(lastLog().ctx).toMatchObject({
      outcome: "fail",
      error_code: "rpc_error",
      rpc_token: "not_leader_of_group",
    });
  });

  it("returns the no-data message when the RPC yields no id", async () => {
    const spec = baseSpec({ rpc: async () => ({ data: null, error: null }) });

    const result = await runLeaderWriteAction(spec, undefined, { group_id: GROUP_ID });

    expect(result).toEqual({ ok: false, errors: ["nothing saved"] });
    expect(lastLog().ctx).toMatchObject({ outcome: "fail", error_code: "rpc_no_data" });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("revalidates, logs ok with merged fields, and returns the result on success", async () => {
    const spec = baseSpec({
      okFields: (_value, id) => ({ new_session_id: id }),
      revalidate: (value) => ["/leader", `/leader/${value.group_id}/checkin`],
      result: (id) => ({ id }),
    });

    const result = await runLeaderWriteAction(spec, undefined, { group_id: GROUP_ID });

    expect(result).toEqual({ ok: true, value: { id: NEW_ID } });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/leader");
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/leader/${GROUP_ID}/checkin`);
    expect(lastLog().ctx).toMatchObject({
      outcome: "ok",
      actor_profile_id: PROFILE_ID,
      target_group_id: GROUP_ID,
      new_session_id: NEW_ID,
    });
  });

  it("uses a custom result mapper for the {session_id} envelope", async () => {
    const spec: LeaderWriteActionSpec<Payload, { session_id: string }> = {
      ...baseSpec(),
      result: (id) => ({ session_id: id }),
    };

    const result = await runLeaderWriteAction(spec, undefined, { group_id: GROUP_ID });

    expect(result).toEqual({ ok: true, value: { session_id: NEW_ID } });
  });
});
