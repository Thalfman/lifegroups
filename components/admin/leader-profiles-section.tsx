import { SectionHeader } from "@/components/layout/shell";
import { LeaderProfileForm } from "@/components/admin/forms/leader-profile-form";
import { DeactivateProfileButton } from "@/components/admin/forms/deactivate-profile-button";
import { PBadge } from "@/components/pastoral/atoms";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";
import { ROLE_LABELS } from "@/lib/auth/roles";
import type { ProfilesRow } from "@/types/database";

const LEADER_LIKE = new Set<ProfilesRow["role"]>(["leader", "co_leader"]);

export function LeaderProfilesSection({
  profiles,
  currentActorProfileId,
  error,
}: {
  profiles: ProfilesRow[];
  currentActorProfileId: string;
  error: string | null;
}) {
  const leaderProfiles = profiles.filter((p) => LEADER_LIKE.has(p.role));
  const activeLeaders = leaderProfiles.filter((p) => p.status === "active");
  const inactiveLeaders = leaderProfiles.filter((p) => p.status === "inactive");

  return (
    <section style={{ display: "grid", gap: 18 }}>
      <SectionHeader
        eyebrow="Leaders"
        title="Sign-in profiles"
        description="Leaders sign in to record attendance and check-ins. Add a leader here, then assign them to a group below."
      />

      <Card>
        <LeaderProfileForm />
      </Card>

      {error ? (
        <ErrorBanner>Couldn&rsquo;t load leader profiles: {error}</ErrorBanner>
      ) : activeLeaders.length === 0 ? (
        <Empty
          title="No active leaders yet"
          description="Add the first leader using the form above. They&rsquo;ll appear here, ready to assign to a group."
        />
      ) : (
        <Card padded={false}>
          <ul style={listResetStyle}>
            {activeLeaders.map((p) => (
              <li
                key={p.id}
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
                    {p.full_name}
                  </div>
                  <div
                    style={{
                      fontFamily: fontBody,
                      fontSize: 13,
                      color: P.ink2,
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <span>{p.email}</span>
                    {p.phone ? <span style={{ color: P.ink3 }}>· {p.phone}</span> : null}
                    <PBadge tone="healthy">{ROLE_LABELS[p.role]}</PBadge>
                  </div>
                </div>
                {p.id === currentActorProfileId ? (
                  <span
                    style={{
                      fontFamily: fontSans,
                      fontSize: 11,
                      color: P.ink3,
                      fontStyle: "italic",
                    }}
                  >
                    That&rsquo;s you
                  </span>
                ) : (
                  <DeactivateProfileButton profileId={p.id} fullName={p.full_name} />
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {inactiveLeaders.length > 0 ? (
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
            Inactive leader profiles ({inactiveLeaders.length})
          </summary>
          <ul style={{ ...listResetStyle, marginTop: 10 }}>
            {inactiveLeaders.map((p) => (
              <li
                key={p.id}
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
                <span style={{ fontStyle: "italic" }}>{p.full_name}</span>
                <span>· {p.email}</span>
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

function Card({ children, padded = true }: { children: React.ReactNode; padded?: boolean }) {
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
