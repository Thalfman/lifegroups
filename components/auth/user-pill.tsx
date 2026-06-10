import { PAvatar } from "@/components/pastoral/atoms";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS, type UserRole } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";

export function UserPill({
  name,
  email,
  role,
  variant = "header",
}: {
  name: string;
  email: string | null;
  role: UserRole;
  variant?: "header" | "drawer";
}) {
  const isDrawer = variant === "drawer";
  return (
    <div
      className={cn(
        "flex items-center",
        isDrawer ? "gap-2.5" : "gap-1.5 md:gap-2.5"
      )}
    >
      <div
        className={cn(
          "min-w-0 flex-col gap-0.5",
          isDrawer
            ? "flex items-start text-left"
            : // Identity text collapses on mobile in the header — the avatar
              // alone carries the pill there (was .lg-m-userpill-text).
              "hidden items-end text-right md:flex"
        )}
      >
        <span
          className={cn(
            "font-sans italic leading-tight text-ink",
            isDrawer ? "text-base" : "text-sm"
          )}
        >
          {name}
        </span>
        {email ? (
          <span
            className={cn(
              "break-all font-sans leading-tight text-ink3",
              isDrawer ? "text-xs" : "text-2xs"
            )}
          >
            {email}
          </span>
        ) : null}
        <Badge
          tone="neutral"
          className={cn("mt-0.5", isDrawer ? "self-start" : "self-end")}
        >
          {ROLE_LABELS[role]}
        </Badge>
      </div>
      <PAvatar name={name} size={isDrawer ? 40 : 32} tone="terra" />
    </div>
  );
}
