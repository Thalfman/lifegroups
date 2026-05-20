import { P, fontBody, fontSans } from "@/lib/pastoral";
import { PAvatar } from "@/components/pastoral/atoms";
import { ROLE_LABELS, type UserRole } from "@/lib/auth/roles";

export function UserPill({
  name,
  email,
  role,
  variant = "header",
}: {
  name: string;
  email: string | null;
  role: UserRole;
  variant?: "header" | "drawer";
}) {
  const isDrawer = variant === "drawer";
  return (
    <div
      className={isDrawer ? undefined : "lg-m-userpill"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <div
        className={isDrawer ? undefined : "lg-m-userpill-text"}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: isDrawer ? "flex-start" : "flex-end",
          gap: 2,
          textAlign: isDrawer ? "left" : "right",
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontFamily: fontBody,
            fontStyle: "italic",
            fontSize: isDrawer ? 14 : 13,
            color: P.ink,
            lineHeight: 1.15,
          }}
        >
          {name}
        </span>
        {email ? (
          <span
            style={{
              fontFamily: fontSans,
              fontSize: isDrawer ? 12 : 10.5,
              color: P.ink3,
              lineHeight: 1.15,
              wordBreak: "break-all",
            }}
          >
            {email}
          </span>
        ) : null}
        <span
          style={{
            fontFamily: fontSans,
            fontSize: 9.5,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: P.ink2,
            fontWeight: 600,
            border: `1px solid ${P.line}`,
            background: P.bg,
            borderRadius: 999,
            padding: "2px 8px",
            marginTop: 2,
            alignSelf: isDrawer ? "flex-start" : "flex-end",
          }}
        >
          {ROLE_LABELS[role]}
        </span>
      </div>
      <PAvatar name={name} size={isDrawer ? 40 : 32} tone="terra" />
    </div>
  );
}
