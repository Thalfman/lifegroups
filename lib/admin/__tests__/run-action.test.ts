import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireAdminSession, mockCreateClient, mockRevalidatePath } = vi.hoisted(
  () => ({
    mockRequireAdminSession: vi.fn(),
    mockCreateClient: vi.fn(),
    mockRevalidatePath: vi.fn(),
  }),
);

vi.mock("@/lib/auth/session", () => ({
  requireAdminSession: mockRequireAdminSession,
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
  runAdminWriteAction,
  type AdminWriteActionSpec,
} from "@/lib/admin/run-action";

const ACTOR_ID = "11111111-1111-1111-1111-111111111111";
const NEW_ID = "22222222-2222-2222-2222-222222222222";

function authOk(role = "ministry_admin") {
  return {
    ok: true as const,
    session: { profile: { id: ACTOR_ID, role } },
  };
}

// Minimal spec used by most branch tests: a single required `name` field,
// echoes one target field, returns { id }.
type Payload = { name: string };

function baseSpec(
  overrides: Partial<AdminWriteActionSpec<Payload, { id: string }>> = {},
): AdminWriteActionSpec<Payload, { id: string }> {
  return {
    name: "admin.test.action",
    keys: ["name"],
    validate: (raw) =>
      typeof raw.name === "string" && raw.name.length > 0
        ? { ok: true, value: { name: raw.name } }
        : { ok: false, errors: ["name required"] },
    fields: (_actor, value) => ({ target_name: value.name }),
    rpc: vi.fn(async () => ({ data: NEW_ID, error: null })),
    revalidate: () => "/admin/test",
    noDataError: "nothing saved",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  logCalls.length = 0;
  mockRequireAdminSession.mockResolvedValue(authOk());
  mockCreateClient.mockResolvedValue({ rpc: vi.fn() });
});

function lastLog() {
  return logCalls[logCalls.length - 1];
}

describe("runAdminWriteAction", () => {
  it("returns the auth error and logs denied when the session is rejected", async () => {
    mockRequireAdminSession.mockResolvedValue({ ok: false, error: "sign in" });

    const result = await runAdminWriteAction(baseSpec(), undefined, { name: "x" });

    expect(result).toEqual({ ok: false, errors: ["sign in"] });
    expect(lastLog().ctx).toMatchObject({ outcome: "denied", error_code: "auth_denied" });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("returns validation errors without hitting the client", async () => {
    const result = await runAdminWriteAction(baseSpec(), undefined, { name: "" });

    expect(result).toEqual({ ok: false, errors: ["name required"] });
    expect(lastLog().ctx).toMatchObject({
      outcome: "fail",
      error_code: "validation_failed",
      actor_role: "ministry_admin",
    });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("bails with the guard's error and code when the guard denies", async () => {
    const spec = baseSpec({
      guard: () => ({ error: "no self-target", code: "self_guard" }),
    });

    const result = await runAdminWriteAction(spec, undefined, { name: "x" });

    expect(result).toEqual({ ok: false, errors: ["no self-target"] });
    expect(lastLog().ctx).toMatchObject({ outcome: "denied", error_code: "self_guard" });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("fails closed when the supabase client is not configured", async () => {
    mockCreateClient.mockResolvedValue(null);

    const result = await runAdminWriteAction(baseSpec(), undefined, { name: "x" });

    expect(result).toEqual({ ok: false, errors: ["Database is not configured."] });
    expect(lastLog().ctx).toMatchObject({
      outcome: "fail",
      error_code: "supabase_not_configured",
      target_name: "x",
    });
  });

  it("maps the RPC error token to a friendly message", async () => {
    const spec = baseSpec({
      rpc: async () => ({ data: null, error: { message: "insufficient_privilege" } }),
    });

    const result = await runAdminWriteAction(spec, undefined, { name: "x" });

    expect(result.ok).toBe(false);
    expect(lastLog().ctx).toMatchObject({
      outcome: "fail",
      error_code: "rpc_error",
      rpc_token: "insufficient_privilege",
      target_name: "x",
    });
  });

  it("returns the no-data message when the RPC yields no id", async () => {
    const spec = baseSpec({ rpc: async () => ({ data: null, error: null }) });

    const result = await runAdminWriteAction(spec, undefined, { name: "x" });

    expect(result).toEqual({ ok: false, errors: ["nothing saved"] });
    expect(lastLog().ctx).toMatchObject({ outcome: "fail", error_code: "rpc_no_data" });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("revalidates, logs ok with merged fields, and returns the result on success", async () => {
    const spec = baseSpec({
      okFields: (_value, id) => ({ new_id: id }),
      revalidate: () => ["/admin/test", "/admin/test/detail"],
    });

    const result = await runAdminWriteAction(spec, undefined, { name: "x" });

    expect(result).toEqual({ ok: true, value: { id: NEW_ID } });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/test");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/test/detail");
    expect(lastLog().ctx).toMatchObject({
      outcome: "ok",
      actor_role: "ministry_admin",
      target_name: "x",
      new_id: NEW_ID,
    });
  });

  it("awaits async field extractors exactly once and threads them into the log", async () => {
    const fields = vi.fn(async (_actor, value: Payload) => ({ hashed: `h:${value.name}` }));
    const spec = baseSpec({ fields });

    const result = await runAdminWriteAction(spec, undefined, { name: "x" });

    expect(result.ok).toBe(true);
    expect(fields).toHaveBeenCalledTimes(1);
    expect(lastLog().ctx).toMatchObject({ hashed: "h:x" });
  });

  it("uses a custom result mapper when provided", async () => {
    const spec: AdminWriteActionSpec<Payload, { session_id: string }> = {
      ...baseSpec(),
      result: (id) => ({ session_id: id }),
    };

    const result = await runAdminWriteAction(spec, undefined, { name: "x" });

    expect(result).toEqual({ ok: true, value: { session_id: NEW_ID } });
  });

  it("lifts named fields out of FormData", async () => {
    const rpc = vi.fn(async () => ({ data: NEW_ID, error: null }));
    const form = new FormData();
    form.set("name", "from-form");

    const result = await runAdminWriteAction(baseSpec({ rpc }), undefined, form);

    expect(result).toEqual({ ok: true, value: { id: NEW_ID } });
    expect(rpc).toHaveBeenCalledWith(expect.anything(), { name: "from-form" });
  });
});
