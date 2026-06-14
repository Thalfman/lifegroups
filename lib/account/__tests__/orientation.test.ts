import { describe, expect, it } from "vitest";

import { readFirstRunOrientationSeen } from "@/lib/account/orientation";

// The read goes through callJsonRpc, which calls client.rpc(name, args) and
// returns { data: r.data ?? null, error: r.error }. A minimal stub mirroring
// that single chain is enough.
function clientReturning(result: {
  data: unknown;
  error: { message: string } | null;
}) {
  return { rpc: async () => result } as never;
}

describe("readFirstRunOrientationSeen", () => {
  it("returns true when the RPC reports the card was dismissed", async () => {
    expect(
      await readFirstRunOrientationSeen(
        clientReturning({ data: true, error: null })
      )
    ).toBe(true);
  });

  it("returns false when the RPC reports it has not been dismissed", async () => {
    expect(
      await readFirstRunOrientationSeen(
        clientReturning({ data: false, error: null })
      )
    ).toBe(false);
  });

  it("degrades to seen (true) on a failed read so it never nags", async () => {
    expect(
      await readFirstRunOrientationSeen(
        clientReturning({ data: null, error: { message: "boom" } })
      )
    ).toBe(true);
  });
});
