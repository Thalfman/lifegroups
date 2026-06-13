import { renderAppIcon } from "../render";

// Apple touch icon (iOS "Add to Home Screen" + the Capacitor shell), 180x180 on
// an opaque background — iOS does not honor transparency. Served as a plain
// route handler (not the apple-icon.tsx metadata convention) so the
// <link rel="apple-touch-icon"> can be referenced as a plain string from
// app/layout.tsx and emitted synchronously alongside the favicon, rather than
// via Next's async (hashed-URL) metadata boundary that the convention uses.
export const runtime = "nodejs";

export function GET() {
  return renderAppIcon({ size: 180 });
}
