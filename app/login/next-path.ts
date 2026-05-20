// Accept only same-origin relative paths. Reject protocol-relative ("//host"),
// backslash variants ("/\\host"), and absolute URLs so that
// `?next=//attacker.example` can't be turned into an off-site redirect.
export function isSafeNextPath(value: string): boolean {
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  if (value.startsWith("/\\")) return false;
  return true;
}

export type SignInSearchParams = Promise<{
  next?: string | string[];
  reset?: string | string[];
}>;

export async function parseSignInSearchParams(
  searchParams: SignInSearchParams,
): Promise<{ next: string | null; resetOk: boolean }> {
  const params = await searchParams;
  const nextRaw = params.next;
  const nextValue = Array.isArray(nextRaw) ? nextRaw[0] : nextRaw;
  const next = nextValue && isSafeNextPath(nextValue) ? nextValue : null;
  const resetRaw = params.reset;
  const resetValue = Array.isArray(resetRaw) ? resetRaw[0] : resetRaw;
  const resetOk = resetValue === "ok";
  return { next, resetOk };
}
