import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateClient, mockRevalidatePath } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockRevalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mockCreateClient,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

const logCalls: {
  level: "info" | "warn" | "error";
  ctx: Record<string, unknown>;
}[] = [];
vi.mock("@/lib/observability/logger", () => ({
  log: {
    info: (ctx: Record<string, unknown>) =>
      logCalls.push({ level: "info", ctx }),
    warn: (ctx: Record<string, unknown>) =>
      logCalls.push({ level: "warn", ctx }),
    error: (ctx: Record<string, unknown>) =>
      logCalls.push({ level: "error", ctx }),
  },
}));

import { runWriteAction, type WriteActionCore } from "@/lib/shared/run-action";

const NEW_ID = "22222222-2222-2222-2222-222222222222";

type Actor = { userId: string };
type Payload = { name: string };

// Minimal core exercising the shared pipeline directly (the adapter suites in
// lib/admin and lib/leader pin the adapter mappings; this suite pins the
// seams the adapters don't reach: context, treatAsOk, authenticate codes, and
// the navigation rethrow).
function baseCore<C = undefined>(
  overrides: Partial<
    WriteActionCore<Actor, Payload, { id: string }, string, C>
  > = {}
): WriteActionCore<Actor, Payload, { id: string }, string, C> {
  return {
    name: "shared.test.action",
    authenticate: async () => ({
      ok: true,
      actor: { userId: "u-1" },
      baseFields: { actor_role: "tester" },
    }),
    read: (input) => (input ?? {}) as Record<string, unknown>,
    validate: (raw) =>
      typeof raw.name === "string" && raw.name.length > 0
        ? { ok: true, value: { name: raw.name } }
        : { ok: false, errors: ["name required"] },
    rpc: vi.fn(async () => ({ data: NEW_ID, error: null })),
    revalidate: () => "/test",
    noDataError: "nothing saved",
    mapRpcError: () => "rpc failed",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  logCalls.length = 0;
  mockCreateClient.mockResolvedValue({ rpc: vi.fn() });
});

function lastLog() {
  return logCalls[logCalls.length - 1];
}

describe("runWriteAction context seam", () => {
  it("threads the minted context into rpc and result, and its fields onto ok", async () => {
    const rpc = vi.fn(async () => ({ data: NEW_ID, error: null }));
    const core = baseCore<{ token: string }>({
      context: async () => ({
        ok: true,
        context: { token: "raw-token" },
        fields: { minted: true },
      }),
      rpc,
      result: (data, _value, ctx) => ({ id: `${data}:${ctx.token}` }),
    });

    const result = await runWriteAction(core, { name: "x" });

    expect(result).toEqual({ ok: true, value: { id: `${NEW_ID}:raw-token` } });
    expect(rpc).toHaveBeenCalledWith(
      expect.anything(),
      { name: "x" },
      {
        token: "raw-token",
      }
    );
    expect(lastLog().ctx).toMatchObject({ outcome: "ok", minted: true });
  });

  it("bails with the context failure code and never calls the rpc", async () => {
    const rpc = vi.fn(async () => ({ data: NEW_ID, error: null }));
    const core = baseCore<{ token: string }>({
      context: async () => ({
        ok: false,
        error: "no site origin",
        code: "origin_unresolved",
      }),
      rpc,
    });

    const result = await runWriteAction(core, { name: "x" });

    expect(result).toEqual({ ok: false, errors: ["no site origin"] });
    expect(lastLog().ctx).toMatchObject({
      outcome: "fail",
      error_code: "origin_unresolved",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("honors a context failure outcome override", async () => {
    const core = baseCore<never>({
      context: async () => ({
        ok: false,
        error: "not yours",
        code: "not_owner",
        outcome: "denied",
      }),
    });

    await runWriteAction(core, { name: "x" });

    expect(lastLog().ctx).toMatchObject({
      outcome: "denied",
      error_code: "not_owner",
    });
  });

  it("bails supabase_not_configured before the context step runs", async () => {
    mockCreateClient.mockResolvedValue(null);
    const context = vi.fn();
    const core = baseCore<{ token: string }>({
      context: context as never,
    });

    const result = await runWriteAction(core, { name: "x" });

    expect(result).toEqual({
      ok: false,
      errors: ["Database is not configured."],
    });
    expect(lastLog().ctx).toMatchObject({
      error_code: "supabase_not_configured",
    });
    expect(context).not.toHaveBeenCalled();
  });
});

describe("runWriteAction treatAsOk seam", () => {
  it("treats a matching rpc error token as success with the token fields", async () => {
    const core = baseCore({
      rpc: vi.fn(async () => ({
        data: null,
        error: { message: "P0001: deletion_already_requested" },
      })),
      treatAsOk: [
        {
          token: "deletion_already_requested",
          result: { id: "already" },
          fields: { error_code: "already_requested" },
        },
      ],
    });

    const result = await runWriteAction(core, { name: "x" });

    expect(result).toEqual({ ok: true, value: { id: "already" } });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/test");
    expect(lastLog().ctx).toMatchObject({
      outcome: "ok",
      error_code: "already_requested",
    });
  });

  it("falls through to rpc_error when no token matches", async () => {
    const core = baseCore({
      rpc: vi.fn(async () => ({
        data: null,
        error: { message: "P0001: forbidden_target" },
      })),
      treatAsOk: [
        { token: "deletion_already_requested", result: { id: "already" } },
      ],
      mapRpcError: (raw) =>
        raw.includes("forbidden_target") ? "not allowed" : "rpc failed",
    });

    const result = await runWriteAction(core, { name: "x" });

    expect(result).toEqual({ ok: false, errors: ["not allowed"] });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
    expect(lastLog().ctx).toMatchObject({
      outcome: "fail",
      error_code: "rpc_error",
      rpc_token: "P0001: forbidden_target",
    });
  });
});

describe("runWriteAction authenticate codes", () => {
  it("logs the authenticate failure's own code when supplied", async () => {
    const core = baseCore({
      authenticate: async () => ({
        ok: false,
        error: "sign in first",
        code: "no_session",
      }),
    });

    const result = await runWriteAction(core, { name: "x" });

    expect(result).toEqual({ ok: false, errors: ["sign in first"] });
    expect(lastLog().ctx).toMatchObject({
      outcome: "denied",
      error_code: "no_session",
    });
  });

  it("defaults the authenticate failure code to auth_denied", async () => {
    const core = baseCore({
      authenticate: async () => ({ ok: false, error: "sign in first" }),
    });

    await runWriteAction(core, { name: "x" });

    expect(lastLog().ctx).toMatchObject({
      outcome: "denied",
      error_code: "auth_denied",
    });
  });
});

describe("runWriteAction navigation rethrow", () => {
  it("rethrows a Next navigation error with a single ok log line", async () => {
    const navigation = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/;303;",
    });
    const core = baseCore({
      rpc: vi.fn(async () => {
        throw navigation;
      }),
    });

    await expect(runWriteAction(core, { name: "x" })).rejects.toBe(navigation);
    expect(logCalls).toHaveLength(1);
    expect(lastLog().ctx).toMatchObject({
      outcome: "ok",
      error_code: "next_navigation",
    });
  });

  it("still converts a plain throw into the generic unhandled_exception", async () => {
    const core = baseCore({
      rpc: vi.fn(async () => {
        throw new Error("boom");
      }),
    });

    const result = await runWriteAction(core, { name: "x" });

    expect(result).toEqual({
      ok: false,
      errors: ["Something went wrong. Please try again."],
    });
    expect(lastLog().ctx).toMatchObject({
      outcome: "fail",
      error_code: "unhandled_exception",
      error_message: "boom",
    });
  });
});
