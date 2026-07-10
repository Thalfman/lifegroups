import { describe, expect, it } from "vitest";

import { readOwnNameState } from "@/lib/account/own-name";
import type { AppSupabaseClient } from "@/lib/supabase/types";

const AUTH_USER_ID = "44444444-4444-4444-4444-444444444444";

// Minimal from().select().eq().maybeSingle() chain stub — the only read the
// module performs (profiles, column allowlist).
function clientReturning(result: { data: unknown; error: unknown }) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => result,
        }),
      }),
    }),
  } as unknown as AppSupabaseClient;
}

describe("readOwnNameState", () => {
  it("returns the pending state with the real name as prefill", async () => {
    const client = clientReturning({
      data: {
        full_name: "Jordan Rivers",
        full_name_pending: true,
        email: "jordan@example.com",
      },
      error: null,
    });
    await expect(readOwnNameState(client, AUTH_USER_ID)).resolves.toEqual({
      pending: true,
      prefill: "Jordan Rivers",
    });
  });

  it("maps the fresh-invite email placeholder to an empty prefill", async () => {
    const client = clientReturning({
      data: {
        full_name: "jordan@example.com",
        full_name_pending: true,
        email: "jordan@example.com",
      },
      error: null,
    });
    await expect(readOwnNameState(client, AUTH_USER_ID)).resolves.toEqual({
      pending: true,
      prefill: "",
    });
  });

  it("returns an empty prefill when the name is not pending", async () => {
    const client = clientReturning({
      data: {
        full_name: "Jordan Rivers",
        full_name_pending: false,
        email: "jordan@example.com",
      },
      error: null,
    });
    await expect(readOwnNameState(client, AUTH_USER_ID)).resolves.toEqual({
      pending: false,
      prefill: "",
    });
  });

  // The repo-wide read rule: a failed read degrades (null) rather than
  // reporting a false value the caller would act on.
  it("returns null when the read fails", async () => {
    const client = clientReturning({
      data: null,
      error: { message: "boom" },
    });
    await expect(readOwnNameState(client, AUTH_USER_ID)).resolves.toBeNull();
  });

  it("returns null when no profile row is linked", async () => {
    const client = clientReturning({ data: null, error: null });
    await expect(readOwnNameState(client, AUTH_USER_ID)).resolves.toBeNull();
  });

  it.each([
    ["full_name is not a string", { full_name: 7 }],
    ["email is not a string", { email: null }],
    ["full_name_pending is not a boolean", { full_name_pending: "true" }],
  ])("returns null on an unexpected row shape (%s)", async (_label, patch) => {
    const client = clientReturning({
      data: {
        full_name: "Jordan Rivers",
        full_name_pending: true,
        email: "jordan@example.com",
        ...patch,
      },
      error: null,
    });
    await expect(readOwnNameState(client, AUTH_USER_ID)).resolves.toBeNull();
  });
});
