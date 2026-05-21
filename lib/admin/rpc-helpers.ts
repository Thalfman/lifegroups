// Trust-boundary helpers for the admin RPC wrappers in `./rpc.ts`.
//
// The SECURITY DEFINER admin RPCs each return a uuid string on success
// or null on rejection. The wrappers previously cast `r.data as string |
// null` blindly; this helper enforces the documented contract at the
// boundary so a misbehaving driver, future schema change, or test stub
// can't tunnel a non-uuid value into downstream call sites that expect
// "is this the new row's id?" semantics.

import { UUID_RE } from "@/lib/shared/uuid";

export function readUuidRpcData(data: unknown): string | null {
  if (typeof data !== "string") return null;
  if (!UUID_RE.test(data)) return null;
  return data.toLowerCase();
}
