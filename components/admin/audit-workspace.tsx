"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Icon } from "@/components/lg/Icon";
import { cn } from "@/lib/utils";
import { buttonClassName } from "@/components/ui/button";
import {
  fieldHintClassName,
  fieldInputClassName,
  fieldLabelClassName,
} from "@/components/admin/forms/field-styles";
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
    <section className="grid min-w-0 gap-4">
      <div className="grid min-w-0 gap-1">
        <label htmlFor="audit-search" className={fieldLabelClassName}>
          Search audit events
        </label>
        <input
          id="audit-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by description, action, or person…"
          aria-describedby="audit-search-help"
          className={fieldInputClassName}
        />
        <p id="audit-search-help" className={fieldHintClassName}>
          Matches the event description, the action name, the record type, and
          the acting person.
        </p>
      </div>

      <div
        role="group"
        aria-label="Filter audit events by category"
        className="flex flex-wrap gap-1.5"
      >
        {CATEGORY_FILTERS.map((filter) => {
          const selected = filter.id === category;
          return (
            <button
              key={filter.id}
              type="button"
              aria-pressed={selected}
              onClick={() => setCategory(filter.id)}
              className={cn(
                "inline-flex cursor-pointer appearance-none items-center gap-1.5 rounded-pill border px-3 py-1.5 font-sans text-xs font-semibold transition-colors duration-150",
                selected
                  ? "border-ink bg-ink text-bg"
                  : "border-line bg-surface text-ink2 hover:bg-surfaceAlt"
              )}
            >
              {/* The active filter carries a check mark on top of the inverted
                  fill, so the selected state doesn't ride on color alone. */}
              {selected ? (
                <Icon name="check" size={11} strokeWidth={2.4} />
              ) : null}
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
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-sans text-xs text-ink2">
          Showing {visible.length} of {total} event
          {total === 1 ? "" : "s"}
        </span>
        <button
          type="button"
          onClick={onClear}
          className="cursor-pointer appearance-none border-none bg-transparent p-0 font-sans text-xs font-semibold text-clay"
        >
          Clear filters
        </button>
      </div>
      {visible.length === 0 ? (
        <div className="grid justify-items-center gap-2.5 rounded-md border border-dashed border-line bg-surface px-6 py-5 text-center font-sans text-sm text-ink2">
          <p className="m-0 font-semibold text-ink">
            No audit events match these filters.
          </p>
          <p className="m-0">
            Try a shorter search term or a different category — searches match
            the description, action, record type, and acting person.
          </p>
          <button
            type="button"
            onClick={onClear}
            className={buttonClassName("ghost", "sm")}
          >
            Clear filters and show all events
          </button>
        </div>
      ) : (
        <ol className="m-0 grid list-none gap-px overflow-hidden rounded-md border border-line bg-lineSoft p-0">
          {visible.map((entry) => (
            <li
              key={entry.id}
              className="grid min-h-11 grid-cols-1 items-center gap-3 bg-surface px-4 py-3 md:grid-cols-[1fr_auto]"
            >
              <div className="min-w-0">
                <div className="mb-0.5 font-sans text-base font-medium text-ink">
                  {entry.summary}
                </div>
                <div className="flex flex-wrap gap-2 font-sans text-sm text-ink3">
                  <span>
                    {entry.actionLabel} · {entry.entityType}
                  </span>
                  {entry.actorLabel ? <span>by {entry.actorLabel}</span> : null}
                </div>
              </div>
              <div className="whitespace-nowrap font-sans text-xs text-ink3">
                {entry.timestamp}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
