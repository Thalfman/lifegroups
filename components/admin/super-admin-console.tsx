"use client";

import {
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { P, fontSans } from "@/lib/pastoral";

// Super Admin Console workspace switcher (Super Admin redesign).
//
// The console reads as a calm operator surface: a compact status row, then a
// segmented set of task-based workspaces shown one at a time. Modeled on
// components/admin/settings-tabs.tsx — same WAI-ARIA tabs pattern (role=tablist
// / role=tab / role=tabpanel) with a roving tabindex and Arrow/Home/End keyboard
// navigation, and only the active panel mounted.
//
// Mounting only the active panel is deliberate, not just an a11y nicety: leaving
// the Danger Zone workspace unmounts its type-to-confirm fields, so a half-typed
// confirmation phrase can never linger behind another tab.

export type SuperAdminWorkspace = {
  id: string;
  label: string;
  // Marks the Danger Zone tab so it reads as visually distinct (terra accent).
  danger?: boolean;
  node: ReactNode;
};

export function SuperAdminConsole({
  statusRow,
  workspaces,
  defaultWorkspaceId = "readiness",
}: {
  statusRow: ReactNode;
  workspaces: SuperAdminWorkspace[];
  defaultWorkspaceId?: string;
}) {
  const initial = workspaces.some((w) => w.id === defaultWorkspaceId)
    ? defaultWorkspaceId
    : (workspaces[0]?.id ?? "");
  const [activeId, setActiveId] = useState(initial);
  const tabRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());

  function focusTab(id: string) {
    setActiveId(id);
    // Move DOM focus to the newly selected tab so keyboard navigation tracks
    // the selection (roving tabindex).
    requestAnimationFrame(() => {
      tabRefs.current.get(id)?.focus();
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % workspaces.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (index - 1 + workspaces.length) % workspaces.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = workspaces.length - 1;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    const next = workspaces[nextIndex];
    if (next) focusTab(next.id);
  }

  const activeWorkspace =
    workspaces.find((w) => w.id === activeId) ?? workspaces[0];

  return (
    <div style={{ display: "grid", gap: 20, minWidth: 0 }}>
      {statusRow}

      <div
        className="lg-super-admin-workspace-tabs"
        role="tablist"
        aria-label="Super admin workspaces"
        style={tablistStyle}
      >
        {workspaces.map((workspace, index) => {
          const selected = workspace.id === activeId;
          return (
            <button
              key={workspace.id}
              ref={(el) => {
                tabRefs.current.set(workspace.id, el);
              }}
              type="button"
              role="tab"
              id={`super-admin-tab-${workspace.id}`}
              aria-selected={selected}
              aria-controls={`super-admin-panel-${workspace.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveId(workspace.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              style={tabStyleFor(selected, workspace.danger)}
            >
              {workspace.label}
            </button>
          );
        })}
      </div>

      {activeWorkspace ? (
        <div
          role="tabpanel"
          id={`super-admin-panel-${activeWorkspace.id}`}
          aria-labelledby={`super-admin-tab-${activeWorkspace.id}`}
          tabIndex={0}
          style={{ minWidth: 0 }}
        >
          {activeWorkspace.node}
        </div>
      ) : null}
    </div>
  );
}

const tablistStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 4,
  padding: 4,
  borderRadius: 14,
  background: P.bgDeep,
  border: `1px solid ${P.line}`,
  // A segmented rail that wraps rather than clips at narrow widths — the mobile
  // requirement. width:fit-content keeps it compact on wide screens; the
  // lg-super-admin-workspace-tabs class lets it fill the row on mobile.
  width: "fit-content",
  maxWidth: "100%",
};

const tabBaseStyle: CSSProperties = {
  appearance: "none",
  border: "1px solid transparent",
  background: "transparent",
  fontFamily: fontSans,
  fontSize: 13,
  fontWeight: 500,
  padding: "8px 16px",
  borderRadius: 999,
  cursor: "pointer",
  lineHeight: 1.2,
  transition: "background .12s, color .12s, border-color .12s",
};

function tabStyleFor(selected: boolean, danger?: boolean): CSSProperties {
  if (danger) {
    return selected
      ? {
          ...tabBaseStyle,
          background: P.terra,
          color: P.surface,
          borderColor: P.terra,
          boxShadow: "0 1px 2px rgba(125,54,33,0.18)",
        }
      : { ...tabBaseStyle, color: P.terraTextStrong, borderColor: P.terra };
  }
  return selected
    ? {
        ...tabBaseStyle,
        background: P.surface,
        color: P.ink,
        boxShadow: "0 1px 2px rgba(58,42,26,0.08)",
      }
    : { ...tabBaseStyle, color: P.ink2 };
}
