import type { CSSProperties, ReactNode } from "react";
import { LockKeyhole } from "lucide-react";

const SUPER_ADMIN_MARK_LABEL = "Super Admin only";

// Small visual marker for features that render only for the super admin but live
// inside tabs that other roles can also see. It lets the super admin tell at a
// glance which controls are private to them. It carries no gating logic of its
// own; always render it inside a block that is already super-admin-only.
export function SuperAdminOnlyBadge() {
  return <SuperAdminOnlyMark />;
}

export function SuperAdminScopeNotice({
  children = "Super Admin controls in this section are hidden from every other role.",
}: {
  children?: ReactNode;
}) {
  return (
    <p className="m-0 rounded-sm border border-clay/35 bg-claySoft px-3.5 py-2.5 font-sans text-sm text-clay">
      {children}
    </p>
  );
}

// Compact sibling of SuperAdminOnlyBadge for dense, button-level contexts. A
// small clay lock chip with a tooltip + a visually-hidden label carries the
// accessible name (title alone is not reliable). Like the badge, it has no
// gating logic; render only inside an already-super-admin-only block.
export function SuperAdminOnlyMark({
  size = 14,
  style,
  label = SUPER_ADMIN_MARK_LABEL,
}: {
  size?: number;
  style?: CSSProperties;
  label?: string;
}) {
  return (
    <span
      title={label}
      data-testid="super-admin-only-mark"
      className="inline-flex shrink-0 items-center justify-center rounded-pill bg-claySoft text-clay"
      style={{ width: size + 8, height: size + 8, ...style }}
    >
      <LockKeyhole size={size} strokeWidth={1.8} aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}
