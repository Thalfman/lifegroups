import { SectionHeader } from "@/components/layout/shell";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";
import {
  AUDIT_ACTION_LABELS,
  summarizeAuditEvent,
} from "@/lib/admin/audit-summary";
import type {
  AuditEventsRow,
  GroupsRow,
  MembersRow,
  ProfilesRow,
} from "@/types/database";

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function AuditTrailSection({
  events,
  profilesById,
  membersById,
  groupsById,
  error,
}: {
  events: AuditEventsRow[];
  profilesById: Map<string, ProfilesRow>;
  membersById: Map<string, MembersRow>;
  groupsById: Map<string, GroupsRow>;
  error: string | null;
}) {
  return (
    <section style={{ display: "grid", gap: 18 }}>
      <SectionHeader
        eyebrow="Audit trail"
        title="Every change, recorded"
        description="A read-only stream of admin people-management actions. Phone numbers are intentionally omitted; admin can see contact details on the profile directly."
      />
      {error ? (
        <ErrorBanner>Couldn&rsquo;t load audit events: {error}</ErrorBanner>
      ) : events.length === 0 ? (
        <Empty
          title="No admin actions recorded yet"
          description="Once you add or assign someone above, the change will land here for the record."
        />
      ) : (
        <ol
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "grid",
            gap: 1,
            background: P.line2,
            border: `1px solid ${P.line}`,
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {events.map((event) => {
            const actor = event.actor_profile_id
              ? profilesById.get(event.actor_profile_id)
              : null;
            // ADR 0014 (#314): fall back to the denormalized descriptor when the
            // actor profile is gone (permanently deleted -> FK nulled).
            const actorLabel = actor?.full_name ?? event.actor_name ?? null;
            return (
              <li
                key={event.id}
                className="lg-m-grid-stack"
                style={{
                  background: P.surface,
                  padding: "12px 16px",
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
                      fontSize: 14,
                      color: P.ink,
                      fontWeight: 500,
                      marginBottom: 2,
                    }}
                  >
                    {summarizeAuditEvent(event, {
                      profilesById,
                      membersById,
                      groupsById,
                    })}
                  </div>
                  <div
                    style={{
                      fontFamily: fontSans,
                      fontSize: 11,
                      color: P.ink3,
                      letterSpacing: 0.3,
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <span>
                      {AUDIT_ACTION_LABELS[event.action] ?? event.action} ·{" "}
                      {event.entity_type}
                    </span>
                    {actorLabel ? <span>by {actorLabel}</span> : null}
                  </div>
                </div>
                <div
                  style={{
                    fontFamily: fontSans,
                    fontSize: 11,
                    color: P.ink3,
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatTimestamp(event.created_at)}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
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
