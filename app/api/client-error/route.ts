import { NextResponse } from "next/server";
import { logClientError } from "@/lib/observability/client-errors";
import { extractClientIpFromHeaders } from "@/lib/security/client-ip";
import { checkPublicTelemetryLimit } from "@/lib/security/rate-limit";
import {
  hasValidDeclaredBodyLength,
  isSameOriginTelemetryRequest,
  readBoundedRequestText,
} from "@/lib/security/public-telemetry-request";

// Same-origin sink for client error-boundary beacons (#861), mirroring
// `app/api/vitals/route.ts`. The boundaries send a small JSON body via a
// keepalive fetch; we read the raw text and let `logClientError` own the
// parsing. Fire-and-forget: any malformed body is dropped without throwing,
// and the response is an empty 204.
//
// No auth gate is needed: the route writes nothing but a structured log line
// carrying no PII or secret (the route is normalized and messages are always
// discarded by `logClientError`). It is also exempt from the session proxy (see
// `proxy.ts`) so a beacon from a crashed page never pays a `getClaims()`
// round trip.
const RESPONSE = { status: 204 } as const;

// Match the parser's 2 KB raw cap. Declared and actual streamed bytes are both
// checked before a report can reach the logger.
const MAX_BODY_BYTES = 2048;

export async function POST(request: Request): Promise<NextResponse> {
  // Require explicit same-origin Fetch Metadata and a small declared length,
  // then apply an app-level HMAC IP limit (or bounded shared fallback) before
  // streaming at most MAX_BODY_BYTES. Missing metadata fails closed.

  if (
    !isSameOriginTelemetryRequest(request) ||
    !hasValidDeclaredBodyLength(request, MAX_BODY_BYTES)
  ) {
    return new NextResponse(null, RESPONSE);
  }

  try {
    const ip = extractClientIpFromHeaders(request.headers);
    const limit = await checkPublicTelemetryLimit({
      endpoint: "client-error",
      ip,
    });
    if (limit.configured && !limit.allowed) {
      return new NextResponse(null, RESPONSE);
    }

    const raw = await readBoundedRequestText(request, MAX_BODY_BYTES);
    if (raw !== null) logClientError(raw);
  } catch {
    // Telemetry must never surface an error to the page.
  }
  return new NextResponse(null, RESPONSE);
}
