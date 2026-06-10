import { SectionHeader } from "@/components/layout/shell";
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
    <section className="grid gap-4">
      <SectionHeader
        eyebrow="Audit trail"
        title="Every change is recorded"
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
        <ol className="m-0 grid list-none gap-px overflow-hidden rounded-md border border-line bg-lineSoft p-0">
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
                className="grid min-h-11 grid-cols-1 items-center gap-3 bg-surface px-4 py-3 md:grid-cols-[1fr_auto]"
              >
                <div className="min-w-0">
                  <div className="mb-0.5 font-sans text-base font-medium text-ink">
                    {summarizeAuditEvent(event, {
                      profilesById,
                      membersById,
                      groupsById,
                    })}
                  </div>
                  <div className="flex flex-wrap gap-2 font-sans text-sm text-ink3">
                    <span>
                      {AUDIT_ACTION_LABELS[event.action] ?? event.action} ·{" "}
                      {event.entity_type}
                    </span>
                    {actorLabel ? <span>by {actorLabel}</span> : null}
                  </div>
                </div>
                <div className="whitespace-nowrap font-sans text-xs text-ink3">
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
    <div className="rounded-md border border-dashed border-line bg-surface px-6 py-5 text-center">
      <div className="mb-1.5 font-display text-lg font-medium text-ink">
        {title}
      </div>
      <p className="m-0 font-sans text-sm text-ink2">{description}</p>
    </div>
  );
}

function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-sm border border-rose/40 bg-roseSoft px-3.5 py-3 font-sans text-sm text-rose">
      {children}
    </div>
  );
}
