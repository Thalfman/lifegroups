import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireAdminSession, mockCreateClient, mockRevalidatePath } =
  vi.hoisted(() => ({
    mockRequireAdminSession: vi.fn(),
    mockCreateClient: vi.fn(),
    mockRevalidatePath: vi.fn(),
  }));

vi.mock("@/lib/auth/session", () => ({
  requireAdminSession: mockRequireAdminSession,
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

import {
  runAdminWriteAction,
  type AdminWriteActionSpec,
  type AuthGate,
  type ValidationResult,
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
  overrides: Partial<AdminWriteActionSpec<Payload, { id: string }>> = {}
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

    const result = await runAdminWriteAction(baseSpec(), undefined, {
      name: "x",
    });

    expect(result).toEqual({ ok: false, errors: ["sign in"] });
    expect(lastLog().ctx).toMatchObject({
      outcome: "denied",
      error_code: "auth_denied",
    });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("returns validation errors without hitting the client", async () => {
    const result = await runAdminWriteAction(baseSpec(), undefined, {
      name: "",
    });

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
    expect(lastLog().ctx).toMatchObject({
      outcome: "denied",
      error_code: "self_guard",
    });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("fails closed when the supabase client is not configured", async () => {
    mockCreateClient.mockResolvedValue(null);

    const result = await runAdminWriteAction(baseSpec(), undefined, {
      name: "x",
    });

    expect(result).toEqual({
      ok: false,
      errors: ["Database is not configured."],
    });
    expect(lastLog().ctx).toMatchObject({
      outcome: "fail",
      error_code: "supabase_not_configured",
      target_name: "x",
    });
  });

  it("maps the RPC error token to a friendly message", async () => {
    const spec = baseSpec({
      rpc: async () => ({
        data: null,
        error: { message: "insufficient_privilege" },
      }),
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
    expect(lastLog().ctx).toMatchObject({
      outcome: "fail",
      error_code: "rpc_no_data",
    });
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

  it("forwards a typed revalidate target's `type` to revalidatePath (dynamic route)", async () => {
    const spec = baseSpec({
      revalidate: () => [
        "/admin/test",
        { path: "/admin/test/[id]", type: "page" },
      ],
    });

    const result = await runAdminWriteAction(spec, undefined, { name: "x" });

    expect(result.ok).toBe(true);
    // Bare string -> single-arg call; typed target -> path + type so a whole
    // dynamic route is invalidated in one call.
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/test");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/test/[id]", "page");
  });

  it("awaits async field extractors exactly once and threads them into the log", async () => {
    const fields = vi.fn(async (_actor, value: Payload) => ({
      hashed: `h:${value.name}`,
    }));
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

    const result = await runAdminWriteAction(
      baseSpec({ rpc }),
      undefined,
      form
    );

    expect(result).toEqual({ ok: true, value: { id: NEW_ID } });
    // Third arg is the pre-RPC context — undefined when the spec declares none.
    expect(rpc).toHaveBeenCalledWith(
      expect.anything(),
      { name: "from-form" },
      undefined
    );
  });

  it("logs the error_count on validation failure", async () => {
    const spec = baseSpec({
      validate: () => ({ ok: false, errors: ["a", "b", "c"] }),
    });

    await runAdminWriteAction(spec, undefined, { name: "" });

    expect(lastLog().ctx).toMatchObject({
      outcome: "fail",
      error_code: "validation_failed",
      error_count: 3,
    });
  });

  it("uses a custom auth gate instead of requireAdminSession", async () => {
    const customAuth = vi.fn(async () => authOk("super_admin"));
    const spec = baseSpec({ auth: customAuth as unknown as AuthGate });

    const result = await runAdminWriteAction(spec, undefined, { name: "x" });

    expect(result.ok).toBe(true);
    expect(customAuth).toHaveBeenCalledTimes(1);
    expect(mockRequireAdminSession).not.toHaveBeenCalled();
    expect(lastLog().ctx).toMatchObject({
      outcome: "ok",
      actor_role: "super_admin",
    });
  });

  it("honors a guard outcome override so a non-auth bail logs fail", async () => {
    const spec = baseSpec({
      guard: () => ({
        error: "nothing to change",
        code: "empty_diff",
        outcome: "fail",
      }),
    });

    const result = await runAdminWriteAction(spec, undefined, { name: "x" });

    expect(result).toEqual({ ok: false, errors: ["nothing to change"] });
    expect(lastLog().ctx).toMatchObject({
      outcome: "fail",
      error_code: "empty_diff",
    });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  // Exception safety net (lib/shared/run-action.ts try/catch/finally). An
  // unexpected throw from any stage must become a generic typed error and a
  // single terminal `unhandled_exception` log line — never an uncaught 500 or
  // an unfinished action log.
  const GENERIC_ERROR = "Something went wrong. Please try again.";

  it.each([
    [
      "validator",
      baseSpec({
        validate: () => {
          throw new Error("boom in validate");
        },
      }),
    ],
    [
      "guard",
      baseSpec({
        guard: () => {
          throw new Error("boom in guard");
        },
      }),
    ],
    [
      "fields builder",
      baseSpec({
        fields: async () => {
          throw new Error("boom in fields");
        },
      }),
    ],
    [
      "rpc call",
      baseSpec({
        rpc: async () => {
          throw new Error("boom in rpc");
        },
      }),
    ],
  ])(
    "catches a throw from the %s and returns a generic error with an unhandled_exception log",
    async (_stage, spec) => {
      const result = await runAdminWriteAction(spec, undefined, { name: "x" });

      expect(result).toEqual({ ok: false, errors: [GENERIC_ERROR] });
      expect(lastLog().ctx).toMatchObject({
        outcome: "fail",
        error_code: "unhandled_exception",
        // The swallowed throw's detail is captured server-side (never returned
        // to the client) so the failure stays diagnosable in the action log.
        error_name: "Error",
        error_message: expect.stringMatching(/^boom in /),
      });
      expect(lastLog().ctx.error_stack).toEqual(expect.any(String));
    }
  );

  it("catches a throw from revalidatePath after the write and still finishes the log once", async () => {
    // Once-only so the throwing implementation can't leak into later tests
    // (vi.clearAllMocks resets call history, not implementations).
    mockRevalidatePath.mockImplementationOnce(() => {
      throw new Error("boom in revalidate");
    });

    const result = await runAdminWriteAction(baseSpec(), undefined, {
      name: "x",
    });

    expect(result).toEqual({ ok: false, errors: [GENERIC_ERROR] });
    expect(lastLog().ctx).toMatchObject({
      outcome: "fail",
      error_code: "unhandled_exception",
    });
    // The terminal line is emitted exactly once (idempotent finish).
    const finals = logCalls.filter(
      (c) => c.ctx.error_code === "unhandled_exception"
    );
    expect(finals).toHaveLength(1);
  });

  it("does not let the safety-net finally overwrite a normal success log", async () => {
    const result = await runAdminWriteAction(baseSpec(), undefined, {
      name: "x",
    });

    expect(result).toEqual({ ok: true, value: { id: NEW_ID } });
    // The success line wins; the finally's finish() is a no-op, so no
    // unhandled_exception line is emitted.
    expect(lastLog().ctx).toMatchObject({ outcome: "ok" });
    expect(
      logCalls.some((c) => c.ctx.error_code === "unhandled_exception")
    ).toBe(false);
  });

  it("uses a custom reader and threads raw into revalidate and okFields", async () => {
    const read = vi.fn(() => ({ name: "x", group_id: "g-9" }));
    const revalidate = vi.fn(
      (_value: Payload, raw: Record<string, unknown>) => [
        `/admin/groups/${String(raw.group_id)}`,
      ]
    );
    const spec = baseSpec({
      read,
      keys: undefined,
      revalidate,
      okFields: (_value, _id, raw) => ({ target_group_id: raw.group_id }),
    });

    const result = await runAdminWriteAction(spec, undefined, {
      anything: true,
    });

    expect(result.ok).toBe(true);
    expect(read).toHaveBeenCalledWith({ anything: true });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin/groups/g-9");
    expect(lastLog().ctx).toMatchObject({
      outcome: "ok",
      target_group_id: "g-9",
    });
  });

  // The context seam: the adapter threads spec.context through to the shared
  // core so a spec can mint a pre-RPC value (invite token + hash) that feeds
  // both the RPC args and the success value. Branch mechanics (fields merge,
  // outcome override, ordering vs the client check) are pinned in the shared
  // suite (lib/shared/__tests__/run-action.test.ts).
  it("threads a minted context into rpc and result", async () => {
    const rpc = vi.fn(async () => ({ data: NEW_ID, error: null }));
    const spec: AdminWriteActionSpec<
      Payload,
      { id: string; token: string },
      string,
      { token: string }
    > = {
      name: "admin.test.context",
      keys: ["name"],
      validate: (raw) =>
        typeof raw.name === "string" && raw.name.length > 0
          ? { ok: true, value: { name: raw.name } }
          : { ok: false, errors: ["name required"] },
      context: async () => ({ ok: true, context: { token: "t-1" } }),
      rpc,
      result: (data, _value, ctx) => ({ id: data, token: ctx.token }),
      revalidate: () => "/admin/test",
      noDataError: "nothing saved",
    };

    const result = await runAdminWriteAction(spec, undefined, { name: "x" });

    expect(result).toEqual({
      ok: true,
      value: { id: NEW_ID, token: "t-1" },
    });
    expect(rpc).toHaveBeenCalledWith(
      expect.anything(),
      { name: "x" },
      {
        token: "t-1",
      }
    );
  });

  it("bails with the context failure code before the rpc", async () => {
    const rpc = vi.fn(async () => ({ data: NEW_ID, error: null }));
    const spec: AdminWriteActionSpec<
      Payload,
      { id: string },
      string,
      { token: string }
    > = {
      name: "admin.test.context",
      keys: ["name"],
      validate: (raw) =>
        typeof raw.name === "string" && raw.name.length > 0
          ? { ok: true, value: { name: raw.name } }
          : { ok: false, errors: ["name required"] },
      context: async () => ({
        ok: false,
        error: "no origin",
        code: "origin_unresolved",
      }),
      rpc,
      revalidate: () => "/admin/test",
      noDataError: "nothing saved",
    };

    const result = await runAdminWriteAction(spec, undefined, { name: "x" });

    expect(result).toEqual({ ok: false, errors: ["no origin"] });
    expect(lastLog().ctx).toMatchObject({
      outcome: "fail",
      error_code: "origin_unresolved",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  // The widened result seam (RpcResult<D>): a JSON- or text-returning RPC
  // threads its parsed value through `result(data, value)` instead of the
  // default { id }. This is what lets the Super-Admin danger-zone writes (whose
  // RPCs return structured JSON / a count / a snapshot summary) stay behind the
  // one runner skeleton.
  describe("widened RPC result (D)", () => {
    // Built fresh (not by spreading baseSpec) so the widened D isn't fighting
    // baseSpec's D=string okFields type.
    const validate = (
      raw: Record<string, unknown>
    ): ValidationResult<Payload> =>
      typeof raw.name === "string" && raw.name.length > 0
        ? { ok: true, value: { name: raw.name } }
        : { ok: false, errors: ["name required"] };

    it("threads a parsed JSON object through result(data, value)", async () => {
      type Summary = { name: string; total: number };
      const spec: AdminWriteActionSpec<Payload, Summary, { total: number }> = {
        name: "admin.test.json",
        keys: ["name"],
        validate,
        rpc: async () => ({ data: { total: 7 }, error: null }),
        result: (data, value) => ({ name: value.name, total: data.total }),
        revalidate: () => "/admin/test",
        noDataError: "nothing saved",
      };

      const result = await runAdminWriteAction(spec, undefined, { name: "x" });

      expect(result).toEqual({ ok: true, value: { name: "x", total: 7 } });
      expect(lastLog().ctx).toMatchObject({ outcome: "ok" });
    });

    it("threads a text count through result", async () => {
      const spec: AdminWriteActionSpec<Payload, { created: number }> = {
        name: "admin.test.text",
        keys: ["name"],
        validate,
        rpc: async () => ({ data: "3", error: null }),
        result: (data) => ({ created: Number.parseInt(data, 10) }),
        revalidate: () => "/admin/test",
        noDataError: "nothing saved",
      };

      const result = await runAdminWriteAction(spec, undefined, { name: "x" });

      expect(result).toEqual({ ok: true, value: { created: 3 } });
    });

    it("treats a legitimately falsy JSON value as success, not no-data", async () => {
      // `data == null` (not `!data`): a widened D can carry a falsy success
      // value. A `0`/`false`/`{}` return must commit, not trip rpc_no_data.
      const spec: AdminWriteActionSpec<Payload, { flag: unknown }, unknown> = {
        name: "admin.test.falsy",
        keys: ["name"],
        validate,
        rpc: async () => ({ data: false, error: null }),
        result: (data) => ({ flag: data }),
        revalidate: () => "/admin/test",
        noDataError: "nothing saved",
      };

      const result = await runAdminWriteAction(spec, undefined, { name: "x" });

      expect(result).toEqual({ ok: true, value: { flag: false } });
      expect(lastLog().ctx).toMatchObject({ outcome: "ok" });
    });

    it("treats an empty-string return as rpc_no_data on the default string path", async () => {
      // A bare-uuid (D = string) RPC is never "" on success; rejecting it keeps
      // the pre-widening `!data` behavior rather than committing { id: "" }.
      const spec = baseSpec({ rpc: async () => ({ data: "", error: null }) });

      const result = await runAdminWriteAction(spec, undefined, { name: "x" });

      expect(result).toEqual({ ok: false, errors: ["nothing saved"] });
      expect(lastLog().ctx).toMatchObject({
        outcome: "fail",
        error_code: "rpc_no_data",
      });
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });

    it("still treats a null JSON return as rpc_no_data", async () => {
      const spec: AdminWriteActionSpec<Payload, { flag: unknown }, unknown> = {
        name: "admin.test.null",
        keys: ["name"],
        validate,
        rpc: async () => ({ data: null, error: null }),
        result: (data) => ({ flag: data }),
        revalidate: () => "/admin/test",
        noDataError: "nothing saved",
      };

      const result = await runAdminWriteAction(spec, undefined, { name: "x" });

      expect(result).toEqual({ ok: false, errors: ["nothing saved"] });
      expect(lastLog().ctx).toMatchObject({
        outcome: "fail",
        error_code: "rpc_no_data",
      });
      expect(mockRevalidatePath).not.toHaveBeenCalled();
    });
  });
});
