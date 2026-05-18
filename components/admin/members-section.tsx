import { SectionHeader } from "@/components/layout/shell";
import { MemberForm } from "@/components/admin/forms/member-form";
import { DeactivateMemberButton } from "@/components/admin/forms/deactivate-member-button";
import { PBadge } from "@/components/pastoral/atoms";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";
import type { MembersRow } from "@/types/database";

export function MembersSection({
  members,
  error,
}: {
  members: MembersRow[];
  error: string | null;
}) {
  const activeMembers = members.filter((m) => m.status === "active");
  const inactiveMembers = members.filter((m) => m.status === "inactive");

  return (
    <section style={{ display: "grid", gap: 18 }}>
      <SectionHeader
        eyebrow="Members"
        title="Non-auth participants"
        description="Members are tracked here so leaders can mark attendance and so admins can place them into groups. Members never sign in."
      />

      <Card>
        <MemberForm />
      </Card>

      {error ? (
        <ErrorBanner>Couldn&rsquo;t load members: {error}</ErrorBanner>
      ) : activeMembers.length === 0 ? (
        <Empty
          title="No active members yet"
          description="Add the first member using the form above. Members can then be placed into a group from the assignments section."
        />
      ) : (
        <Card padded={false}>
          <ul style={listResetStyle}>
            {activeMembers.map((m) => (
              <li
                key={m.id}
                style={{
                  padding: "14px 18px",
                  borderBottom: `1px solid ${P.line2}`,
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: fontDisplay,
                      fontSize: 16,
                      color: P.ink,
                      fontWeight: 500,
                      marginBottom: 2,
                    }}
                  >
                    {m.full_name}
                  </div>
                  <div
                    style={{
                      fontFamily: fontBody,
                      fontSize: 13,
                      color: P.ink2,
                      display: "flex",
                      gap: 10,
                      flexWrap: "wrap",
                      alignItems: "center",
                    }}
                  >
                    {m.email ? <span>{m.email}</span> : null}
                    {m.phone ? <span style={{ color: P.ink3 }}>· {m.phone}</span> : null}
                    {!m.email && !m.phone ? (
                      <span style={{ color: P.ink3, fontStyle: "italic" }}>
                        no contact details
                      </span>
                    ) : null}
                  </div>
                </div>
                <DeactivateMemberButton memberId={m.id} fullName={m.full_name} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {inactiveMembers.length > 0 ? (
        <details style={{ marginTop: 6 }}>
          <summary
            style={{
              cursor: "pointer",
              fontFamily: fontSans,
              fontSize: 12,
              color: P.ink3,
              fontWeight: 600,
              letterSpacing: 0.6,
              textTransform: "uppercase",
            }}
          >
            Inactive members ({inactiveMembers.length})
          </summary>
          <ul style={{ ...listResetStyle, marginTop: 10 }}>
            {inactiveMembers.map((m) => (
              <li
                key={m.id}
                style={{
                  padding: "10px 14px",
                  fontFamily: fontBody,
                  fontSize: 13,
                  color: P.ink3,
                  borderBottom: `1px dashed ${P.line2}`,
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <span style={{ fontStyle: "italic" }}>{m.full_name}</span>
                <PBadge tone="pause">Inactive</PBadge>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

const listResetStyle = { listStyle: "none", padding: 0, margin: 0 } as const;

function Card({
  children,
  padded = true,
}: {
  children: React.ReactNode;
  padded?: boolean;
}) {
  return (
    <div
      style={{
        background: P.surface,
        border: `1px solid ${P.line}`,
        borderRadius: 10,
        padding: padded ? "18px 22px" : 0,
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

function Empty({ title, description }: { title: string; description: string }) {
  return (
    <div
      style={{
        background: P.surface,
        border: `1px dashed ${P.line}`,
        borderRadius: 10,
        padding: "22px 24px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: fontDisplay,
          fontSize: 16,
          color: P.ink,
          fontWeight: 500,
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <p
        style={{
          fontFamily: fontBody,
          fontSize: 13,
          color: P.ink2,
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        {description}
      </p>
    </div>
  );
}

function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: P.terraSoft,
        border: `1px solid ${P.terra}`,
        borderRadius: 8,
        padding: "12px 14px",
        fontFamily: fontBody,
        fontSize: 13,
        color: "#7d3621",
      }}
    >
      {children}
    </div>
  );
}

