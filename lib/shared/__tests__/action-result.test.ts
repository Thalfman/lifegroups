import { describe, expect, it } from "vitest";
import {
  actionFail,
  actionOk,
  makeRpcErrorMapper,
} from "@/lib/shared/action-result";

describe("action result envelope", () => {
  it("actionOk wraps a value", () => {
    expect(actionOk(42)).toEqual({ ok: true, value: 42 });
  });

  it("actionFail wraps error messages", () => {
    expect(actionFail(["nope"])).toEqual({ ok: false, errors: ["nope"] });
  });
});

describe("makeRpcErrorMapper", () => {
  const map = makeRpcErrorMapper(
    { missing_group: "No such group.", group_closed: "Group is closed." },
    "Fallback copy."
  );

  it("returns the fallback for null/empty input", () => {
    expect(map(null)).toBe("Fallback copy.");
    expect(map(undefined)).toBe("Fallback copy.");
    expect(map("")).toBe("Fallback copy.");
  });

  it("matches an exact token", () => {
    expect(map("missing_group")).toBe("No such group.");
  });

  it("matches a token embedded in a longer message (substring)", () => {
    expect(map('new row violates ... "group_closed" ...')).toBe(
      "Group is closed."
    );
  });

  it("returns the fallback for an unknown token", () => {
    expect(map("some_other_error")).toBe("Fallback copy.");
  });

  // Several surfaces carry a token that is a prefix of a sibling (e.g.
  // invalid_status / invalid_status_transition). The substring fallback must
  // resolve the longer, more specific token — insertion order used to let the
  // short one shadow it in any wrapped message.
  it("prefers the longer token when one is a prefix of another", () => {
    const shadowed = makeRpcErrorMapper(
      {
        invalid_status: "That status isn't allowed.",
        invalid_status_transition: "That transition isn't allowed.",
      },
      "Fallback copy."
    );
    expect(shadowed("P0001: invalid_status_transition")).toBe(
      "That transition isn't allowed."
    );
    expect(shadowed("P0001: invalid_status")).toBe(
      "That status isn't allowed."
    );
  });
});
