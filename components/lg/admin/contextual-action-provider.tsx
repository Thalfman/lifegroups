"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { EditingSurface } from "@/components/lg/admin/editing-surface";
import { useEditingDrawer } from "@/components/lg/admin/use-editing-drawer";
import type {
  ContextualAction,
  ContextualActionBodyKey,
  ContextualEntity,
} from "@/lib/admin/contextual-actions";

// The shared contextual-action host (#776 Phase 0). One context, mounted once
// in the admin shell, that owns a single EditingSurface driven by one
// useEditingDrawer. Any surface calls `openAction({ entity, action })` to render
// the right form body in the drawer — so the Care accordion, Notes feed,
// dashboard queue, and detail headers do NOT each re-own drawer state. This is
// the load-bearing piece that makes "act from anywhere" cheap; it adds no write
// path of its own (the bodies it renders call the existing server actions).

// What's currently open in the shared drawer.
type ActiveContextualAction = {
  entity: ContextualEntity;
  action: ContextualAction;
};

// The controls a body wires its form to, forwarded from the shared drawer state
// machine so each body reports dirty/pending and signals a successful save
// without owning the drawer.
export type ContextualBodyControls = {
  markDirty: () => void;
  reportPending: (pending: boolean) => void;
  markSaved: () => void;
  requestClose: () => void;
};

export type ContextualBodyProps = ActiveContextualAction & {
  controls: ContextualBodyControls;
};

// The body registry: a render fn per drawer-body key. Phase 0 ships an empty
// default (no real surface uses the host yet); Phase 1 registers the Care /
// group editor bodies. Kept a prop (not a hard import) so tests can inject a
// body and the layout can mount the host with the default.
export type ContextualActionBodies = Partial<
  Record<ContextualActionBodyKey, (props: ContextualBodyProps) => ReactNode>
>;

type ContextualActionContextValue = {
  openAction: (next: ActiveContextualAction) => void;
};

const ContextualActionContext =
  createContext<ContextualActionContextValue | null>(null);

export function useContextualAction(): ContextualActionContextValue {
  const ctx = useContext(ContextualActionContext);
  if (!ctx) {
    throw new Error(
      "useContextualAction must be used within a ContextualActionProvider"
    );
  }
  return ctx;
}

export function ContextualActionProvider({
  children,
  bodies = {},
}: {
  children: ReactNode;
  bodies?: ContextualActionBodies;
}) {
  // The drawer machinery is reused wholesale: `target` doubles as "is the
  // drawer open" and "which action is open". closeOnSave so a completed action
  // dismisses the drawer; the body's revalidatePath repaints the surface.
  const drawer = useEditingDrawer<ActiveContextualAction>({
    closeOnSave: true,
  });
  const active = drawer.target;

  const openAction = useCallback(
    (next: ActiveContextualAction) => drawer.open(next),
    [drawer]
  );

  const controls = useMemo<ContextualBodyControls>(
    () => ({
      markDirty: drawer.markDirty,
      reportPending: drawer.reportPending,
      markSaved: drawer.markSaved,
      requestClose: drawer.requestClose,
    }),
    [
      drawer.markDirty,
      drawer.reportPending,
      drawer.markSaved,
      drawer.requestClose,
    ]
  );

  const value = useMemo<ContextualActionContextValue>(
    () => ({ openAction }),
    [openAction]
  );

  const renderBody = (current: ActiveContextualAction): ReactNode => {
    const key = current.action.body;
    const body = key ? bodies[key] : undefined;
    if (!body) {
      // A drawer action with no registered body is a wiring gap, not a crash —
      // surface it plainly so it's caught in review rather than silently doing
      // nothing.
      return (
        <p className="m-0 font-sans text-sm text-ink2">
          No form is wired for “{current.action.label}” yet.
        </p>
      );
    }
    return body({ ...current, controls });
  };

  return (
    <ContextualActionContext.Provider value={value}>
      {children}
      <EditingSurface
        open={drawer.isOpen}
        onRequestClose={drawer.requestClose}
        eyebrow={active?.entity.label ?? undefined}
        title={active?.action.label ?? ""}
        closeLabel={active ? `Close ${active.action.label}` : "Close"}
      >
        {active ? renderBody(active) : null}
      </EditingSurface>
      {drawer.discardDialog}
    </ContextualActionContext.Provider>
  );
}
