import type { ReactNode } from "react";
import { Avatar } from "../Avatar";
import { ROLE_LABELS, type UserRole } from "@/lib/auth/roles";

export function TopBar({
  user,
  mobileTrigger,
  signOutSlot,
}: {
  user: { name: string; email: string | null; role: UserRole };
  mobileTrigger?: ReactNode;
  signOutSlot?: ReactNode;
}) {
  return (
    <div className="sticky top-0 z-sticky flex h-14 items-center justify-between gap-3 border-b border-line bg-surfaceAlt px-4 md:px-8">
      <div className="flex min-w-0 items-center gap-3">
        {mobileTrigger ?? null}
      </div>
      <div className="flex min-w-0 items-center gap-3.5">
        <UserPill user={user} />
        {signOutSlot ?? null}
      </div>
    </div>
  );
}

function UserPill({
  user,
}: {
  user: { name: string; email: string | null; role: UserRole };
}) {
  const roleLabel = ROLE_LABELS[user.role] ?? user.role;
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar name={user.name} size={28} tone="sage" />
      <div className="hidden min-w-0 flex-col leading-tight md:flex">
        <span className="max-w-[200px] truncate font-sans text-sm font-semibold text-ink">
          {user.name}
        </span>
        <span className="font-sans text-xs tracking-wide text-ink3">
          {roleLabel}
        </span>
      </div>
    </div>
  );
}
