import type { ReactNode } from "react";
import { Avatar } from "../Avatar";
import { ROLE_LABELS, type UserRole } from "@/lib/auth/roles";

export function TopBar({
  user,
  mobileTrigger,
  signOutSlot,
}: {
  user: { name: string; email: string | null; role: UserRole };
  mobileTrigger?: ReactNode;
  signOutSlot?: ReactNode;
}) {
  return (
    <div
      className="lg-shell-topbar"
      style={{
        height: 56,
        borderBottom: "1px solid var(--c-line)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 32px",
        background: "var(--c-bg)",
        position: "sticky",
        top: 0,
        zIndex: 10,
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        {mobileTrigger ?? null}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
        <UserPill user={user} />
        {signOutSlot ?? null}
      </div>
    </div>
  );
}

function UserPill({
  user,
}: {
  user: { name: string; email: string | null; role: UserRole };
}) {
  const roleLabel = ROLE_LABELS[user.role] ?? user.role;
  return (
    <div
      className="lg-m-userpill"
      style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}
    >
      <Avatar name={user.name} size={28} tone="sage" />
      <div
        className="lg-m-userpill-text"
        style={{
          display: "flex",
          flexDirection: "column",
          lineHeight: 1.2,
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 12.5,
            fontWeight: 600,
            color: "var(--c-ink)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: 200,
          }}
        >
          {user.name}
        </span>
        <span
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 10.5,
            color: "var(--c-ink3)",
            letterSpacing: 0.3,
          }}
        >
          {roleLabel}
        </span>
      </div>
    </div>
  );
}
