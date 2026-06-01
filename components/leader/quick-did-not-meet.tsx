"use client";

import { leaderQuickMarkDidNotMeet } from "@/app/(protected)/leader/actions";
import { useActionForm } from "@/components/admin/forms/action-form";
import { P, fontBody, fontSans } from "@/lib/pastoral";

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
    <div style={{ display: "grid", gap: 6 }}>
      <form action={formAction} onSubmit={confirm}>
        <input type="hidden" name="group_id" value={groupId} />
        <button
          type="submit"
          disabled={pending}
          style={{
            width: "100%",
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.65)",
            color: P.surface,
            borderRadius: 999,
            padding: "10px 16px",
            fontFamily: fontSans,
            fontSize: 13,
            fontWeight: 500,
            cursor: pending ? "not-allowed" : "pointer",
            opacity: pending ? 0.7 : 1,
          }}
        >
          {pending
            ? "Saving…"
            : state?.ok
              ? "Saved — group did not meet"
              : "Group did not meet"}
        </button>
      </form>
      {state && !state.ok ? (
        <p
          role="alert"
          style={{
            fontFamily: fontBody,
            fontSize: 12.5,
            color: P.surface,
            background: "rgba(255,255,255,0.15)",
            margin: 0,
            padding: "6px 10px",
            borderRadius: 8,
          }}
        >
          {state.errors.join(" ")}
        </p>
      ) : null}
    </div>
  );
}
