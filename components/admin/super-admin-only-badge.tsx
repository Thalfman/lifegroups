import type { CSSProperties } from "react";
import { Pill } from "@/components/lg/Pill";

// Small visual marker for features that render only for the super admin but live
// inside tabs that other roles can also see. It lets the super admin tell at a
// glance which controls are private to them. It carries no gating logic of its
// own — always render it inside a block that is already super-admin-only.
export function SuperAdminOnlyBadge() {
  return (
    <span title="Visible to the super admin only — hidden from other roles">
      <Pill tone="clay" size="sm" style={{ fontWeight: 600 }}>
        Super admin only
      </Pill>
    </span>
  );
}

// Compact sibling of SuperAdminOnlyBadge for dense, button-level contexts (e.g.
// next to an inline action button in a table row) where the full text pill would
// be too heavy. A small clay lock chip with a tooltip + a visually-hidden label
// so it carries a real accessible name (title alone isn't reliable). Like the
// badge, it has no gating logic — render only inside an already-super-admin-only
// block.
export function SuperAdminOnlyMark({
  size = 14,
  style,
  label = "Super admin only — hidden from other roles",
}: {
  size?: number;
  style?: CSSProperties;
  label?: string;
}) {
  return (
    <span
      title={label}
      data-testid="super-admin-only-mark"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size + 8,
        height: size + 8,
        borderRadius: 999,
        background: "var(--c-claySoft)",
        color: "var(--c-clay)",
        flexShrink: 0,
        ...style,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}
