"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Mount-on-first-open disclosure for the Care accordion (#777 Workstream 3).
// The Over-Shepherds view nests three disclosure levels (Over-Shepherd pane →
// Leader → Grades & notes), each previously eager: every CareLeaderPanel and its
// form-heavy editors hydrated up front, behind collapsed <details>, depressing
// INP across /admin/care. This wrapper keeps the summary roll-up server-rendered
// (always shown, so a collapsed pane still signals where the work is) but defers
// the expensive body until the pane/leader/editor is first opened — then keeps
// it mounted so re-collapse is instant.
//
// The <details> stays UNCONTROLLED on purpose: the native disclosure toggles
// without client JS (the affordance and chevron rotation work pre-hydration),
// and we never fight it with a controlled `open`. We only observe `onToggle` and
// latch `opened` one-way to true, gating the children. With JS off the body
// stays empty when expanded — graceful for an admin surface whose body is wholly
// interactive client controls anyway.
export function MountOnOpenDetails({
  summary,
  children,
  detailsClassName,
  summaryClassName,
  bodyClassName,
}: {
  // Always rendered inside <summary> — the server-rendered roll-up.
  summary: ReactNode;
  // Mounted on first open, then kept mounted.
  children: ReactNode;
  detailsClassName?: string;
  summaryClassName?: string;
  bodyClassName?: string;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [opened, setOpened] = useState(false);

  // A native <details> can already be open before React attaches its onToggle
  // listener — an admin clicking the summary during pre-hydration, or the
  // browser restoring an open pane (bfcache / autofocus). That first toggle has
  // no listener, so without this the body would stay empty until a close+reopen.
  // SSR and the first client render still emit opened=false (no hydration
  // mismatch); this adopts the element's real open state right after hydration.
  useEffect(() => {
    if (detailsRef.current?.open) setOpened(true);
  }, []);

  return (
    <details
      ref={detailsRef}
      className={detailsClassName}
      onToggle={(event) => {
        // One-way latch: only ever arm on open, so a later collapse keeps the
        // already-mounted subtree (instant re-expand) instead of unmounting it.
        if (event.currentTarget.open) setOpened(true);
      }}
    >
      <summary className={summaryClassName}>{summary}</summary>
      <div className={bodyClassName}>{opened ? children : null}</div>
    </details>
  );
}
