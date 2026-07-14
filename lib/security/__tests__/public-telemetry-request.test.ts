import { describe, expect, it } from "vitest";
import {
  hasValidDeclaredBodyLength,
  isSameOriginTelemetryRequest,
  readBoundedRequestText,
} from "@/lib/security/public-telemetry-request";

function request(body: string, headers: Record<string, string> = {}): Request {
  return new Request("https://example.test/api/vitals", {
    method: "POST",
    body,
    headers,
  });
}

describe("public telemetry request guards", () => {
  it("requires an explicit same-origin fetch-metadata header", () => {
    expect(
      isSameOriginTelemetryRequest(
        request("{}", { "sec-fetch-site": "same-origin" })
      )
    ).toBe(true);
    expect(isSameOriginTelemetryRequest(request("{}"))).toBe(false);
    expect(
      isSameOriginTelemetryRequest(request("{}", { "sec-fetch-site": "none" }))
    ).toBe(false);
    expect(
      isSameOriginTelemetryRequest(
        request("{}", { "sec-fetch-site": "cross-site" })
      )
    ).toBe(false);
  });

  it("accepts only a present decimal Content-Length within the cap", () => {
    expect(
      hasValidDeclaredBodyLength(request("{}", { "content-length": "2" }), 10)
    ).toBe(true);
    expect(hasValidDeclaredBodyLength(request("{}"), 10)).toBe(false);
    expect(
      hasValidDeclaredBodyLength(request("{}", { "content-length": "-1" }), 10)
    ).toBe(false);
    expect(
      hasValidDeclaredBodyLength(request("{}", { "content-length": "2.5" }), 10)
    ).toBe(false);
    expect(
      hasValidDeclaredBodyLength(request("{}", { "content-length": "999" }), 10)
    ).toBe(false);
  });

  it("reads a body whose actual UTF-8 bytes fit the cap", async () => {
    await expect(readBoundedRequestText(request("hello"), 5)).resolves.toBe(
      "hello"
    );
    await expect(readBoundedRequestText(request("é"), 2)).resolves.toBe("é");
  });

  it("drops a body whose actual bytes exceed the cap despite its declaration", async () => {
    const forged = request("sixsix", { "content-length": "1" });
    await expect(readBoundedRequestText(forged, 5)).resolves.toBeNull();
  });
});
