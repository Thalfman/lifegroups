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
});
