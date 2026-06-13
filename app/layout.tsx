import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Newsreader, Geist, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
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

// Mobile viewport + status-bar tint. `viewport-fit: cover` lets content reach
// the edges on notched devices (paired with safe-area handling); user scaling
// is intentionally left enabled to keep the meta-viewport a11y rule green.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
