import { ROLE_LABELS, type UserRole } from "@/lib/auth/roles";

export function UserPill({
  name,
  email,
  role,
}: {
  name: string;
  email: string | null;
  role: UserRole;
}) {
  return (
    <div className="flex flex-col items-end gap-0.5 text-right">
      <span className="text-sm font-medium leading-none">{name}</span>
      {email ? (
        <span className="text-xs leading-none text-muted-foreground">{email}</span>
      ) : null}
      <span className="mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {ROLE_LABELS[role]}
      </span>
    </div>
  );
}
