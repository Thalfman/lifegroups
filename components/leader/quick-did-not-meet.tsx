"use client";

import { leaderQuickMarkDidNotMeet } from "@/app/(protected)/leader/actions";
import { useActionForm } from "@/components/admin/forms/action-form";
import { Button } from "@/components/ui/button";

export function LeaderQuickDidNotMeet({
  groupId,
  groupName,
}: {
  groupId: string;
  groupName: string;
}) {
  const { state, formAction, pending } = useActionForm<{ session_id: string }>(
    leaderQuickMarkDidNotMeet
  );

  function confirm(e: React.FormEvent<HTMLFormElement>) {
    if (
      !window.confirm(
        `Record that ${groupName} didn't meet this week? You can update this later if anything changes.`
      )
    ) {
      e.preventDefault();
    }
  }

  return (
    <div className="grid gap-1.5">
      <form action={formAction} onSubmit={confirm}>
        <input type="hidden" name="group_id" value={groupId} />
        {/* Quiet secondary on the clay band — the primary is the check-in CTA. */}
        <Button
          type="submit"
          disabled={pending}
          variant="ghost"
          className="w-full border-white/65 text-surface hover:bg-white/10"
        >
          {pending
            ? "Saving…"
            : state?.ok
              ? "Saved — group did not meet"
              : "Group did not meet"}
        </Button>
      </form>
      {state && !state.ok ? (
        <p
          role="alert"
          className="m-0 rounded-sm bg-white/15 px-2.5 py-1.5 font-sans text-xs text-surface"
        >
          {state.errors.join(" ")}
        </p>
      ) : null}
    </div>
  );
}
