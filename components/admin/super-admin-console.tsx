"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { scrollToHashTarget } from "@/lib/nav/scroll-to-hash";

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
  activeWorkspaceId,
  hashAliases,
}: {
  statusRow: ReactNode;
  // An always-visible slot above the status row (e.g. a load-error banner) so a
  // failed read stays visible no matter which workspace is open — only the
  // active workspace panel mounts, so per-workspace banners would hide behind
  // the wrong tab.
  banner?: ReactNode;
  workspaces: SuperAdminWorkspace[];
  activeWorkspaceId: string;
  // Legacy/deep-link hash → workspace id (e.g. "people-import" → "access"), so
  // an existing `/admin/super-admin#people-import` link still opens the right
  // workspace instead of landing on the default with a dead anchor.
  hashAliases?: Record<string, string>;
}) {
  const router = useRouter();
  const tabRefs = useRef<Map<string, HTMLAnchorElement | null>>(new Map());

  useEffect(() => {
    let cancelScroll = () => {};
    function applyHash() {
      const raw = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      if (!raw) return;
      const ids = new Set(workspaces.map((w) => w.id));
      // A direct workspace-id hash wins; otherwise fall back to a known alias.
      const target = ids.has(raw) ? raw : hashAliases?.[raw];
      if (!target || !ids.has(target)) return;
      if (target !== activeWorkspaceId) {
        const url = new URL(window.location.href);
        url.searchParams.set("workspace", target);
        router.replace(url.pathname + url.search + url.hash, {
          scroll: false,
        });
        return;
      }
      // The target workspace panel mounts on the next render, so the element
      // the hash names (e.g. the import card inside Access) is absent until
      // that commit. Poll until it appears, then scroll to it —
      // restoring the anchor's land-on-the-section behaviour instead of stopping
      // at the top. Cancel any in-flight scroll first so a second hashchange wins.
      cancelScroll();
      cancelScroll = scrollToHashTarget(raw);
    }
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => {
      cancelScroll();
      window.removeEventListener("hashchange", applyHash);
    };
  }, [activeWorkspaceId, hashAliases, router, workspaces]);

  function focusTab(id: string) {
    // The switch mounts a whole workspace panel; deferring it keeps the
    // interaction's next paint fast (INP) while focus moves immediately —
    // the tab buttons themselves always exist.
    // Move DOM focus to the newly selected tab so keyboard navigation tracks
    // the selection (roving tabindex).
    requestAnimationFrame(() => {
      const tab = tabRefs.current.get(id);
      tab?.focus();
      tab?.click();
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLAnchorElement>, index: number) {
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
    workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0];

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
            const selected = workspace.id === activeWorkspaceId;
            return (
              <a
                key={workspace.id}
                ref={(el) => {
                  tabRefs.current.set(workspace.id, el);
                }}
                href={
                  "/admin/super-admin?workspace=" +
                  encodeURIComponent(workspace.id)
                }
                role="tab"
                id={`super-admin-tab-${workspace.id}`}
                aria-selected={selected}
                aria-controls={`super-admin-panel-${workspace.id}`}
                tabIndex={selected ? 0 : -1}
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
              </a>
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
