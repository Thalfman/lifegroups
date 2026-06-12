import { notFound } from "next/navigation";
import { Suspense } from "react";
import { A11yHarnessClient } from "./harness-client";

// Gated test-only surface: present only when explicitly enabled, so it never
// ships in a normal production build. The Playwright a11y check (and local
// debugging) set NEXT_PUBLIC_A11Y_HARNESS=1.
export const dynamic = "force-static";

export default function A11yHarnessPage() {
  if (process.env.NEXT_PUBLIC_A11Y_HARNESS !== "1") {
    notFound();
  }
  return (
    <Suspense fallback={null}>
      <A11yHarnessClient />
    </Suspense>
  );
}
