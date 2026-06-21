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
// carrying no PII (see `lib/observability/web-vitals.ts`). The proxy middleware
// refreshes the session cookie but never redirects this path.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    logWebVital(await request.text());
  } catch {
    // Telemetry must never surface an error to the page.
  }
  return new NextResponse(null, { status: 204 });
}
