import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Life Group Operations Dashboard",
  description: "Phase 0 foundation for life group ministry operations.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
