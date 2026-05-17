// Accept only same-origin relative paths. Reject protocol-relative ("//host"),
// backslash variants ("/\\host"), and absolute URLs so that
// `?next=//attacker.example` can't be turned into an off-site redirect.
export function isSafeNextPath(value: string): boolean {
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  if (value.startsWith("/\\")) return false;
  return true;
}
