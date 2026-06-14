import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Newsreader, Geist, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { PwaClientSetup } from "@/components/pwa/pwa-client-setup";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
});

const geist = Geist({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-geist",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Fox Valley Church Life Groups",
  description: "Ministry operations for Fox Valley Church Life Groups.",
  applicationName: "LifeGroups",
  // Favicon stays the existing asset; the Apple touch icon is generated at
  // /icons/touch. The string form keeps both <link> tags synchronous in
  // <head> (no async hashed-URL metadata boundary).
  icons: {
    icon: "/favicon.png",
    apple: "/icons/touch",
  },
  // Installed/standalone (iOS "Add to Home Screen" + Capacitor shell) hints.
  // The web manifest (app/manifest.ts) covers Android; this covers Apple.
  appleWebApp: {
    capable: true,
    title: "LifeGroups",
    statusBarStyle: "default",
  },
};

// Mobile viewport + status-bar tint. User scaling is intentionally left enabled
// to keep the meta-viewport a11y rule green. `viewport-fit: cover` (drawing into
// the notch / home-indicator area) is deliberately NOT set here: the sticky
// TopBar and sticky submit bar have no `env(safe-area-inset-*)` offsets yet, so
// cover is deferred to the Phase 2 mobile-UX hardening that adds safe-area
// handling (see the responsive-chrome issue).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fbfaf4",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${geist.variable} ${jetbrains.variable}`}
    >
      <body>
        {children}
        <PwaClientSetup />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
