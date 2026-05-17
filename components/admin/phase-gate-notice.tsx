export const PHASE_5A_1_GATE_COPY =
  "Unlocks in Phase 5A.1 once the narrow admin write policies and server actions are implemented and verified against live Supabase.";

export function PhaseGateNotice() {
  return (
    <div
      role="status"
      className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      <p className="font-medium">Pre-launch scaffold — no writes enabled</p>
      <p className="mt-1 text-xs">
        This page is a structural preview. No live people, roles, group assignments, or audit
        events are loaded, and every action below is intentionally disabled.
      </p>
      <ul className="mt-2 space-y-1 text-xs">
        <li>
          <strong>Phase 5A.1</strong> enables narrow writes for admin people, role changes, and
          group assignments — gated by allowlisted columns and RLS policies.
        </li>
        <li>
          <strong>Phase 5B</strong> enables operational writes: attendance submission, guest
          capture, and follow-up updates.
        </li>
      </ul>
    </div>
  );
}
