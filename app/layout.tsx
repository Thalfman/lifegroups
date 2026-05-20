import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Newsreader, Geist, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
});

const geist = Geist({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
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
  icons: { icon: "/favicon.png" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${geist.variable} ${jetbrains.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
