"use client";

import { superAdminEndCoverage } from "@/app/(protected)/admin/super-admin/coverage-actions";
import { useActionForm, FormStatus } from "./action-form";
import { Button } from "@/components/ui/button";

// Phase SAC.4 (#164): end an active coverage assignment.
export function CoverageEndForm({ assignmentId }: { assignmentId: string }) {
  const { state, formAction, pending } = useActionForm<{ id: string }>(
    superAdminEndCoverage
  );

  return (
    <form action={formAction} className="grid gap-1.5">
      <input type="hidden" name="assignment_id" value={assignmentId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        {pending ? "Ending…" : "End"}
      </Button>
      <FormStatus state={state} />
    </form>
  );
}
