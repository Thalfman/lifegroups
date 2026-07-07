import { notFound } from "next/navigation";
import { Suspense } from "react";
import { A11yHarnessClient } from "./harness-client";
import { buildHarnessDemoData } from "./demo-data";

// Gated test-only surface: present only when explicitly enabled, so it never
// ships in a normal production build. The Playwright a11y check (and local
// debugging) set NEXT_PUBLIC_A11Y_HARNESS=1.
export const dynamic = "force-static";

export default async function A11yHarnessPage() {
  if (process.env.NEXT_PUBLIC_A11Y_HARNESS !== "1") {
    notFound();
  }
  // The seam-backed surfaces' payloads are built server-side through the SAME
  // buildXData functions the live pages call (over in-memory demo adapters —
  // ADR 0038), because those builders are server-bound; the client shell
  // receives one plain-JSON prop. Deterministic, so force-static holds.
  const demo = await buildHarnessDemoData();
  return (
    <Suspense fallback={null}>
      <A11yHarnessClient demo={demo} />
    </Suspense>
  );
}
