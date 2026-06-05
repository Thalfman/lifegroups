"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { P, fontBody, fontDisplay, fontSans } from "@/lib/pastoral";
import type { AuditCategory } from "@/lib/admin/audit-summary";

// Audit workspace filter scaffolding (Super Admin redesign).
//
// The canonical, untouched AuditTrailSection is passed in as `fullList` and
// shown by default ("newest N shown by default"). When a search term or a
// category filter is applied, this wrapper renders its own filtered list from
// the serialisable `entries` the shell computes server-side — the
// Map-dependent summaries are computed there, so nothing Map-heavy has to cross
// the server/client boundary.

export type AuditEntry = {
  id: string;
  summary: string;
  actionLabel: string;
  entityType: string;
  actorLabel: string | null;
  timestamp: string;
  category: AuditCategory;
};

const CATEGORY_FILTERS: { id: AuditCategory | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "role", label: "Role changes" },
  { id: "invite", label: "Invites" },
  { id: "danger", label: "Danger actions" },
  { id: "settings", label: "Settings" },
];

export function AuditWorkspace({
  entries,
  fullList,
}: {
  entries: AuditEntry[];
  fullList: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<AuditCategory | "all">("all");

  const trimmed = query.trim().toLowerCase();
  const filtering = trimmed.length > 0 || category !== "all";

  const visible = useMemo(() => {
    if (!filtering) return entries;
    return entries.filter((entry) => {
      if (category !== "all" && entry.category !== category) return false;
      if (trimmed) {
        const haystack =
          `${entry.summary} ${entry.actionLabel} ${entry.entityType} ${
            entry.actorLabel ?? ""
          }`.toLowerCase();
        if (!haystack.includes(trimmed)) return false;
      }
      return true;
    });
  }, [entries, filtering, category, trimmed]);

  return (
    <section style={{ display: "grid", gap: 16, minWidth: 0 }}>
      <div
        className="lg-m-grid-stack"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          gap: 12,
          alignItems: "end",
        }}
      >
        <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
          <label
            htmlFor="audit-search"
            style={{
              fontFamily: fontSans,
              fontSize: 11,
              letterSpacing: 1,
              textTransform: "uppercase",
              color: P.ink3,
              fontWeight: 700,
            }}
          >
            Search audit events
          </label>
          <input
            id="audit-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by description, action, or person…"
            style={{
              fontFamily: fontSans,
              fontSize: 13,
              color: P.ink,
              background: P.surface,
              border: `1px solid ${P.line}`,
              borderRadius: 8,
              padding: "9px 12px",
            }}
          />
        </div>
      </div>

      <div
        role="group"
        aria-label="Filter audit events by category"
        style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
      >
        {CATEGORY_FILTERS.map((filter) => {
          const selected = filter.id === category;
          return (
            <button
              key={filter.id}
              type="button"
              aria-pressed={selected}
              onClick={() => setCategory(filter.id)}
              style={chipStyle(selected)}
            >
              {filter.label}
            </button>
          );
        })}
      </div>

      {filtering ? (
        <FilteredResults
          visible={visible}
          total={entries.length}
          onClear={() => {
            setQuery("");
            setCategory("all");
          }}
        />
      ) : (
        fullList
      )}
    </section>
  );
}

function FilteredResults({
  visible,
  total,
  onClear,
}: {
  visible: AuditEntry[];
  total: number;
  onClear: () => void;
}) {
  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontFamily: fontSans, fontSize: 12, color: P.ink2 }}>
          Showing {visible.length} of {total} event
          {total === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          onClick={onClear}
          style={{
            appearance: "none",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontFamily: fontSans,
            fontSize: 12,
            fontWeight: 700,
            color: P.terra,
            padding: 0,
          }}
        >
          Clear filters
        </button>
      </div>
      {visible.length === 0 ? (
        <div
          style={{
            background: P.surface,
            border: `1px dashed ${P.line}`,
            borderRadius: 10,
            padding: "22px 24px",
            textAlign: "center",
            fontFamily: fontBody,
            fontSize: 13,
            color: P.ink2,
          }}
        >
          No audit events match these filters.
        </div>
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
          {visible.map((entry) => (
            <li
              key={entry.id}
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
                  {entry.summary}
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
                    {entry.actionLabel} · {entry.entityType}
                  </span>
                  {entry.actorLabel ? <span>by {entry.actorLabel}</span> : null}
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
                {entry.timestamp}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function chipStyle(selected: boolean): CSSProperties {
  return {
    appearance: "none",
    cursor: "pointer",
    fontFamily: fontSans,
    fontSize: 12,
    fontWeight: 600,
    padding: "6px 12px",
    borderRadius: 999,
    border: `1px solid ${selected ? P.ink : P.line}`,
    background: selected ? P.ink : P.surface,
    color: selected ? P.surface : P.ink2,
    transition: "background .12s, color .12s, border-color .12s",
  };
}
