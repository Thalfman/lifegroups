"use client";

import {
  startTransition,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

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
  // Marks the Danger Zone tab so it reads as visually distinct (rose accent).
  danger?: boolean;
  node: ReactNode;
};

export function SuperAdminConsole({
  statusRow,
  banner,
  workspaces,
  defaultWorkspaceId = "readiness",
  hashAliases,
}: {
  statusRow: ReactNode;
  // An always-visible slot above the status row (e.g. a load-error banner) so a
  // failed read stays visible no matter which workspace is open — only the
  // active workspace panel mounts, so per-workspace banners would hide behind
  // the wrong tab.
  banner?: ReactNode;
  workspaces: SuperAdminWorkspace[];
  defaultWorkspaceId?: string;
  // Legacy/deep-link hash → workspace id (e.g. "people-import" → "access"), so
  // an existing `/admin/super-admin#people-import` link still opens the right
  // workspace instead of landing on the default with a dead anchor.
  hashAliases?: Record<string, string>;
}) {
  const initial = workspaces.some((w) => w.id === defaultWorkspaceId)
    ? defaultWorkspaceId
    : (workspaces[0]?.id ?? "");
  const [activeId, setActiveId] = useState(initial);
  const tabRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());

  // Read the latest workspaces/aliases from refs so the hash listener can stay a
  // mount-once effect: it must apply the URL hash on load and on hashchange, but
  // never re-snap the operator's manual tab choice on an unrelated re-render. The
  // refs are written in an effect (not during render) so react-hooks/refs stays
  // satisfied; the only reader is the hashchange effect below, which runs after
  // this one and reads them only on async hash events.
  const workspacesRef = useRef(workspaces);
  const aliasesRef = useRef(hashAliases);
  useEffect(() => {
    workspacesRef.current = workspaces;
    aliasesRef.current = hashAliases;
  });

  useEffect(() => {
    function applyHash() {
      const raw = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      if (!raw) return;
      const ids = new Set(workspacesRef.current.map((w) => w.id));
      // A direct workspace-id hash wins; otherwise fall back to a known alias.
      const target = ids.has(raw) ? raw : aliasesRef.current?.[raw];
      if (!target || !ids.has(target)) return;
      setActiveId(target);
      // The target workspace panel mounts on the next render, so the element the
      // hash names (e.g. the import card inside Access) doesn't exist yet. Defer
      // past the commit with a double rAF, then scroll to it — restoring the old
      // anchor's land-on-the-section behaviour instead of stopping at the top.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          document
            .getElementById(raw)
            ?.scrollIntoView({ block: "start", behavior: "auto" });
        })
      );
    }
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  function focusTab(id: string) {
    // The switch mounts a whole workspace panel; deferring it keeps the
    // interaction's next paint fast (INP) while focus moves immediately —
    // the tab buttons themselves always exist.
    startTransition(() => {
      setActiveId(id);
    });
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
    <div className="grid min-w-0 gap-5">
      {banner}
      {statusRow}

      {/* Keeps the tab rail available in long workspaces from md up: it sticks
          just below the TopBar (top-14 = its 56px height; z below the TopBar's
          z-sticky so it slides under, never over). The page-background backing
          plus the padding/negative-margin bleed stop content from peeking
          through around the rail's rounded corners; net layout spacing is
          unchanged. On mobile the rail stays static so the wrapped multi-row
          band can never sit stuck on top of content. */}
      <div className="md:sticky md:top-14 md:z-[5] md:-my-2 md:bg-bg md:py-2">
        {/* A segmented rail that wraps rather than clips at narrow widths —
            all seven tabs stay visible on a phone. w-fit keeps it compact on
            wide screens, where it fits one row. */}
        <div
          className="flex w-fit max-w-full flex-wrap gap-1 rounded-lg border border-line bg-sidebar p-1"
          role="tablist"
          aria-label="Super admin workspaces"
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
                onClick={() => startTransition(() => setActiveId(workspace.id))}
                onKeyDown={(event) => onKeyDown(event, index)}
                className={cn(
                  "cursor-pointer appearance-none rounded-pill border border-transparent bg-transparent px-4 py-2 font-sans text-sm font-medium leading-tight transition-colors duration-150",
                  workspace.danger
                    ? selected
                      ? "border-rose bg-rose text-white"
                      : "border-rose/40 text-rose hover:bg-roseSoft"
                    : selected
                      ? "border-line bg-surface text-ink"
                      : "text-ink2 hover:bg-surface/60"
                )}
              >
                {workspace.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeWorkspace ? (
        <div
          role="tabpanel"
          id={`super-admin-panel-${activeWorkspace.id}`}
          aria-labelledby={`super-admin-tab-${activeWorkspace.id}`}
          tabIndex={0}
          className="min-w-0"
        >
          {activeWorkspace.node}
        </div>
      ) : null}
    </div>
  );
}
