import { describe, expect, it } from "vitest";
import {
  buildAuditTrailEntries,
  formatAuditTimestamp,
} from "@/lib/admin/audit-trail-entries";
import {
  summarizeAuditEvent,
  type AuditSummaryMaps,
} from "@/lib/admin/audit-summary";
import type { AuditEventsRow } from "@/types/database";

function auditEvent(overrides: Partial<AuditEventsRow>): AuditEventsRow {
  return {
    id: "e1",
    actor_profile_id: null,
    action: "admin.create_group",
    entity_type: "group",
    entity_id: null,
    metadata: {},
    created_at: "2026-01-05T12:30:00Z",
    actor_name: null,
    actor_email: null,
    ...overrides,
  };
}

function maps(): AuditSummaryMaps {
  return {
    profilesById: new Map([["p1", { id: "p1", full_name: "Julian Reyes" }]]),
    membersById: new Map(),
    groupsById: new Map(),
  };
}

describe("buildAuditTrailEntries", () => {
  it("labels known actions and passes unknown actions through raw", () => {
    const [known, unknown] = buildAuditTrailEntries(
      [
        auditEvent({ id: "e1", action: "admin.create_group" }),
        auditEvent({ id: "e2", action: "custom.someday_action" }),
      ],
      maps()
    );
    expect(known.actionLabel).toBe("Created group");
    expect(unknown.actionLabel).toBe("custom.someday_action");
  });

  it("prefers the live profile name, then the denormalized actor_name", () => {
    // The denormalized fallback keeps attribution after the actor's permanent
    // deletion nulls the FK (ADR 0014 tombstone behaviour).
    const [live, tombstoned, anonymous] = buildAuditTrailEntries(
      [
        auditEvent({
          id: "e1",
          actor_profile_id: "p1",
          actor_name: "Stale Name",
        }),
        auditEvent({
          id: "e2",
          actor_profile_id: "p-deleted",
          actor_name: "Deleted Admin",
        }),
        auditEvent({ id: "e3" }),
      ],
      maps()
    );
    expect(live.actorLabel).toBe("Julian Reyes");
    expect(tombstoned.actorLabel).toBe("Deleted Admin");
    expect(anonymous.actorLabel).toBeNull();
  });

  it("categorizes danger-zone actions for the category filter", () => {
    const [danger, other] = buildAuditTrailEntries(
      [
        auditEvent({ id: "e1", action: "super_admin.clean_slate" }),
        auditEvent({ id: "e2", action: "admin.update_group" }),
      ],
      maps()
    );
    expect(danger.category).toBe("danger");
    expect(other.category).toBe("other");
  });

  it("uses the shared event summary verbatim", () => {
    const event = auditEvent({ actor_profile_id: "p1" });
    const [entry] = buildAuditTrailEntries([event], maps());
    expect(entry.summary).toBe(summarizeAuditEvent(event, maps()));
  });

  it("keeps the event order and carries the entity type", () => {
    const entries = buildAuditTrailEntries(
      [
        auditEvent({ id: "e1", entity_type: "group" }),
        auditEvent({ id: "e2", entity_type: "member" }),
      ],
      maps()
    );
    expect(entries.map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(entries.map((e) => e.entityType)).toEqual(["group", "member"]);
  });
});

describe("formatAuditTimestamp", () => {
  it("passes an unparseable value through unchanged", () => {
    expect(formatAuditTimestamp("not-a-date")).toBe("not-a-date");
  });

  it("formats a valid timestamp into the trail's short form", () => {
    // Locale-dependent (matches AuditTrailSection); assert shape, not locale.
    const formatted = formatAuditTimestamp("2026-01-05T12:30:00Z");
    expect(formatted).not.toBe("2026-01-05T12:30:00Z");
    expect(formatted.length).toBeGreaterThan(0);
  });
});
