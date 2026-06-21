import { NextResponse } from "next/server";
import { logWebVital } from "@/lib/observability/web-vitals";

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

export async function POST(request: Request): Promise<NextResponse> {
  // Drop cross-site traffic cheaply: browsers tag a same-origin beacon with
  // `Sec-Fetch-Site: same-origin`, so an explicit cross-site/`cross-origin` POST
  // is rejected before logging. An absent header (older browsers, non-browser
  // clients) falls through and is still validated by `logWebVital`. This is a
  // first layer only — full rate-limiting is infra-level and out of scope here.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") {
    return new NextResponse(null, RESPONSE);
  }

  try {
    logWebVital(await request.text());
  } catch {
    // Telemetry must never surface an error to the page.
  }
  return new NextResponse(null, RESPONSE);
}
