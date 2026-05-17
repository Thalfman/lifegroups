export const PHASE_5A_1_GATE_COPY =
  "Enabled after Phase 5A.1 write policies and server actions are implemented and verified.";

export function PhaseGateNotice() {
  return (
    <div
      role="status"
      className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      <p className="font-medium">Phase 5A.0 — UI/UX scaffold</p>
      <p className="mt-1 text-xs">
        This page is a structural preview. No live people, roles, group assignments, or audit
        events are loaded, and every action below is intentionally disabled. {PHASE_5A_1_GATE_COPY}
      </p>
    </div>
  );
}
