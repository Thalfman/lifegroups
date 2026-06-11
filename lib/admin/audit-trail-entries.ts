import {
  AUDIT_ACTION_LABELS,
  categorizeAuditAction,
  summarizeAuditEvent,
  type AuditCategory,
  type AuditSummaryMaps,
} from "@/lib/admin/audit-summary";
import type { AuditEventsRow } from "@/types/database";

// Flat, serialisable audit-trail entries for the Audit workspace's client-side
// filter. The Map-dependent summaries are computed here, server-side, so the
// client filter receives only flat entries (RSC can't ship the Maps).
// Structurally identical to AuditEntry in components/admin/audit-workspace —
// the shell's typed assignment keeps the two from drifting.

export type AuditTrailEntry = {
  id: string;
  summary: string;
  actionLabel: string;
  entityType: string;
  actorLabel: string | null;
  timestamp: string;
  category: AuditCategory;
};

// Match AuditTrailSection's timestamp format so the filtered list reads
// identically to the default (unfiltered) list it sits beside.
export function formatAuditTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function buildAuditTrailEntries(
  events: readonly AuditEventsRow[],
  maps: AuditSummaryMaps
): AuditTrailEntry[] {
  return events.map((event) => {
    const actor = event.actor_profile_id
      ? maps.profilesById.get(event.actor_profile_id)
      : null;
    return {
      id: event.id,
      summary: summarizeAuditEvent(event, maps),
      actionLabel: AUDIT_ACTION_LABELS[event.action] ?? event.action,
      entityType: event.entity_type,
      // Denormalized actor_name is the fallback when the FK actor row is gone
      // (e.g. after the actor's permanent deletion — ADR 0014).
      actorLabel: actor?.full_name ?? event.actor_name ?? null,
      timestamp: formatAuditTimestamp(event.created_at),
      category: categorizeAuditAction(event.action),
    };
  });
}
