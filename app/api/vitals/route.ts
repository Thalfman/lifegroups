import { NextResponse } from "next/server";
import { logWebVital } from "@/lib/observability/web-vitals";
import { extractClientIpFromHeaders } from "@/lib/security/client-ip";
import { checkPublicTelemetryLimit } from "@/lib/security/rate-limit";
import {
  hasValidDeclaredBodyLength,
  isSameOriginTelemetryRequest,
  readBoundedRequestText,
} from "@/lib/security/public-telemetry-request";

// Same-origin sink for client web-vitals beacons (issue #777, workstream 4).
// The reporter (`components/observability/web-vitals-reporter.tsx`) sends a
// small JSON body via `navigator.sendBeacon`, which defaults to a `text/plain`
// content-type — so we read the raw text and let `logWebVital` own the parsing
// rather than relying on `request.json()`. Fire-and-forget: any malformed body
// is dropped without throwing, and the response is an empty 204.
//
// No auth gate is needed: the route writes nothing but a structured log line
// carrying no PII or secret (the route is normalized in `logWebVital`). It is
// also exempt from the session proxy (see `proxy.ts`) so a beacon never pays a
// `getClaims()` round trip on the very surface it is measuring.
const RESPONSE = { status: 204 } as const;
const MAX_BODY_BYTES = 2048;

export async function POST(request: Request): Promise<NextResponse> {
  // Require an explicit same-origin Fetch Metadata header and a small declared
  // length before doing any work. Then apply an app-level HMAC IP limit (or a
  // bounded shared fallback when no trusted IP is available) before streaming
  // at most MAX_BODY_BYTES. Missing metadata fails closed.

  if (
    !isSameOriginTelemetryRequest(request) ||
    !hasValidDeclaredBodyLength(request, MAX_BODY_BYTES)
  ) {
    return new NextResponse(null, RESPONSE);
  }

  try {
    const ip = extractClientIpFromHeaders(request.headers);
    const limit = await checkPublicTelemetryLimit({ endpoint: "vitals", ip });
    if (limit.configured && !limit.allowed) {
      return new NextResponse(null, RESPONSE);
    }

    const raw = await readBoundedRequestText(request, MAX_BODY_BYTES);
    if (raw !== null) logWebVital(raw);
  } catch {
    // Telemetry must never surface an error to the page.
  }
  return new NextResponse(null, RESPONSE);
}
