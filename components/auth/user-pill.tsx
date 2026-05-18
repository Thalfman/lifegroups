import { P, fontBody, fontSans } from "@/lib/pastoral";
import { PAvatar } from "@/components/pastoral/atoms";
import { ROLE_LABELS, type UserRole } from "@/lib/auth/roles";

export function UserPill({
  name,
  email,
  role,
}: {
  name: string;
  email: string | null;
  role: UserRole;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 2,
          textAlign: "right",
          minWidth: 0,
        }}
      >
        <span
          style={{
            fontFamily: fontBody,
            fontStyle: "italic",
            fontSize: 13,
            color: P.ink,
            lineHeight: 1.1,
          }}
        >
          {name}
        </span>
        {email ? (
          <span
            style={{
              fontFamily: fontSans,
              fontSize: 10.5,
              color: P.ink3,
              lineHeight: 1.1,
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
          }}
        >
          {ROLE_LABELS[role]}
        </span>
      </div>
      <PAvatar name={name} size={32} tone="terra" />
    </div>
  );
}
