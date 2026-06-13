import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Shared renderer for the installable-app icon set. Draws the existing brand
// mark (public/logo.png) centered on the app's warm-cream surface so the PWA
// manifest, Android adaptive icon, and Apple touch icon all derive from one
// source — no separately maintained binary assets. Used by the /icons/* route
// handlers and app/apple-icon.tsx.

const BACKGROUND = "#fbfaf4";

// Inline the mark as a data URI so the renderer (Satori) draws it without a
// network fetch. Read once at module load; the route handlers run on the
// Node.js runtime, where the filesystem is available.
const logoDataUri = `data:image/png;base64,${readFileSync(
  join(process.cwd(), "public", "logo.png")
).toString("base64")}`;

type RenderAppIconOptions = {
  /** Output square edge length, in pixels. */
  size: number;
  /**
   * Pad the mark into Android's adaptive-icon safe zone (content must sit
   * inside the inner ~80%, since the launcher applies a circular/squircle
   * mask). Non-maskable icons fill more of the canvas.
   */
  maskable?: boolean;
};

export function renderAppIcon({
  size,
  maskable = false,
}: RenderAppIconOptions) {
  const markSize = Math.round(size * (maskable ? 0.62 : 0.78));

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: BACKGROUND,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- Satori render target, not a DOM image */}
      <img src={logoDataUri} width={markSize} height={markSize} alt="" />
    </div>,
    {
      width: size,
      height: size,
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    }
  );
}
