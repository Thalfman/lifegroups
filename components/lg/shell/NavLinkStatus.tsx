"use client";

import { useLinkStatus } from "next/link";

// Instant per-link feedback. Rendered as a child of a sidebar <Link>,
// useLinkStatus() reports the pending state of *that* link between click and
// navigation commit — so the clicked item shows a spinner immediately, before
// the route-level skeleton even paints. No prop drilling: each indicator tracks
// its nearest ancestor <Link>.
export function NavLinkStatus() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      style={{
        marginLeft: "auto",
        width: 13,
        height: 13,
        flexShrink: 0,
        borderRadius: "50%",
        border: "1.5px solid var(--c-line)",
        borderTopColor: "var(--c-sageDeep)",
        opacity: pending ? 1 : 0,
        animation: pending ? "lg-spin 0.6s linear infinite" : "none",
        transition: "opacity 0.12s ease",
      }}
    />
  );
}
