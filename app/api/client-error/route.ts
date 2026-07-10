import { NextResponse } from "next/server";
import { logClientError } from "@/lib/observability/client-errors";

// Same-origin sink for client error-boundary beacons (#861), mirroring
// `app/api/vitals/route.ts`. The boundaries send a small JSON body via a
// keepalive fetch; we read the raw text and let `logClientError` own the
// parsing. Fire-and-forget: any malformed body is dropped without throwing,
// and the response is an empty 204.
//
// No auth gate is needed: the route writes nothing but a structured log line
// carrying no PII or secret (the route is normalized and the message truncated
// in `logClientError`). It is also exempt from the session proxy (see
// `proxy.ts`) so a beacon from a crashed page never pays a `getClaims()`
// round trip.
const RESPONSE = { status: 204 } as const;

export async function POST(request: Request): Promise<NextResponse> {
  // Drop cross-site traffic cheaply: browsers tag a same-origin beacon with
  // `Sec-Fetch-Site: same-origin`, so an explicit cross-site/`cross-origin`
  // POST is rejected before logging. An absent header (older browsers,
  // non-browser clients) falls through and is still validated by
  // `logClientError`. First layer only — rate limiting is infra-level.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") {
    return new NextResponse(null, RESPONSE);
  }

  try {
    logClientError(await request.text());
  } catch {
    // Telemetry must never surface an error to the page.
  }
  return new NextResponse(null, RESPONSE);
}
