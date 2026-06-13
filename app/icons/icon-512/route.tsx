import { renderAppIcon } from "../render";

// Node.js runtime: renderAppIcon reads the brand mark from the filesystem.
export const runtime = "nodejs";

export function GET() {
  return renderAppIcon({ size: 512 });
}
