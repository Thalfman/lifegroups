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
