import type { UserRole } from "@/lib/auth/roles";

// The shell-user shape both app shells (LgAppShell `user`, PastoralAppShell
// `currentUser`) consume. Derived from the session profile.
export type ShellUser = {
  name: string;
  email: string | null;
  role: UserRole;
};

// Map a session profile down to the `{ name, email, role }` object the shells
// render. Centralizes the derivation repeated across the leader / over-shepherd
// / account pages so the field mapping lives in one place.
export function toShellUser(profile: {
  full_name: string;
  email: string | null;
  role: UserRole;
}): ShellUser {
  return {
    name: profile.full_name,
    email: profile.email,
    role: profile.role,
  };
}
