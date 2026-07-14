import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkLimit: vi.fn(),
  logClientError: vi.fn(),
  logWebVital: vi.fn(),
}));

vi.mock("@/lib/security/client-ip", () => ({
  extractClientIpFromHeaders: vi.fn(() => "203.0.113.7"),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkPublicTelemetryLimit: mocks.checkLimit,
}));

vi.mock("@/lib/observability/client-errors", () => ({
  logClientError: mocks.logClientError,
}));

vi.mock("@/lib/observability/web-vitals", () => ({
  logWebVital: mocks.logWebVital,
}));

import { POST as postClientError } from "@/app/api/client-error/route";
import { POST as postVitals } from "@/app/api/vitals/route";

type PostHandler = (request: Request) => Promise<Response>;

function telemetryRequest(
  endpoint: string,
  body: string,
  headers: Record<string, string> = {}
): Request {
  return new Request(`https://example.test/api/${endpoint}`, {
    method: "POST",
    body,
    headers,
  });
}

const VALID_HEADERS = {
  "content-length": "2",
  "sec-fetch-site": "same-origin",
};

describe.each([
  ["vitals", postVitals, mocks.logWebVital],
  ["client-error", postClientError, mocks.logClientError],
] as const)("public %s telemetry route", (endpoint, post, logReport) => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkLimit.mockResolvedValue({ configured: true, allowed: true });
  });

  it("requires explicit same-origin Fetch Metadata", async () => {
    const response = await (post as PostHandler)(
      telemetryRequest(endpoint, "{}", { "content-length": "2" })
    );

    expect(response.status).toBe(204);
    expect(mocks.checkLimit).not.toHaveBeenCalled();
    expect(logReport).not.toHaveBeenCalled();
  });

  it("requires a valid declared body length", async () => {
    const response = await (post as PostHandler)(
      telemetryRequest(endpoint, "{}", {
        "sec-fetch-site": "same-origin",
      })
    );

    expect(response.status).toBe(204);
    expect(mocks.checkLimit).not.toHaveBeenCalled();
    expect(logReport).not.toHaveBeenCalled();
  });

  it("rate-limits before reading or logging the body", async () => {
    mocks.checkLimit.mockResolvedValue({ configured: true, allowed: false });

    const response = await (post as PostHandler)(
      telemetryRequest(endpoint, "{}", VALID_HEADERS)
    );

    expect(response.status).toBe(204);
    expect(logReport).not.toHaveBeenCalled();
  });

  it("drops an actually oversized stream despite a forged declaration", async () => {
    const response = await (post as PostHandler)(
      telemetryRequest(endpoint, "x".repeat(2049), {
        ...VALID_HEADERS,
        "content-length": "1",
      })
    );

    expect(response.status).toBe(204);
    expect(logReport).not.toHaveBeenCalled();
  });

  it("logs only a bounded, allowed request", async () => {
    const response = await (post as PostHandler)(
      telemetryRequest(endpoint, "{}", VALID_HEADERS)
    );

    expect(response.status).toBe(204);
    expect(mocks.checkLimit).toHaveBeenCalledWith({
      endpoint,
      ip: "203.0.113.7",
    });
    expect(logReport).toHaveBeenCalledWith("{}");
  });
});
