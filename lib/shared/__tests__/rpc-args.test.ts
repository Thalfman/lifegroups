import { describe, expect, expectTypeOf, it } from "vitest";
import { toRpcArgs } from "@/lib/shared/rpc-args";

describe("toRpcArgs", () => {
  it("picks only the named keys and prefixes each with p_", () => {
    const value = { name: "Alpha", capacity: 12, extra: "never sent" };

    const args = toRpcArgs(value, ["name", "capacity"] as const);

    // toEqual is an exact-key match: `extra` must NOT leak through, because
    // Postgres errors on unknown parameters and TS structural typing would
    // not catch the surplus key.
    expect(args).toEqual({ p_name: "Alpha", p_capacity: 12 });
  });

  it("normalizes undefined to null so the JSON key is not dropped", () => {
    type Payload = { title: string; due_date?: string; notes?: string | null };
    const value: Payload = { title: "Call", notes: undefined };

    const args = toRpcArgs(value, ["title", "due_date", "notes"] as const);

    // Both the absent key and the explicitly-undefined key become explicit
    // nulls; a dropped key would silently take the Postgres parameter default.
    expect(args).toEqual({ p_title: "Call", p_due_date: null, p_notes: null });
  });

  it("passes null, false, 0, and empty string through untouched", () => {
    const value = { note: null, active: false, count: 0, label: "" };

    const args = toRpcArgs(value, [
      "note",
      "active",
      "count",
      "label",
    ] as const);

    expect(args).toEqual({
      p_note: null,
      p_active: false,
      p_count: 0,
      p_label: "",
    });
  });

  it("passes arrays and objects through by reference", () => {
    const attendance = [{ member_id: "m1", attendance_status: "present" }];
    const rule = { interest: { min: 3 } };
    const value = { attendance, rule };

    const args = toRpcArgs(value, ["attendance", "rule"] as const);

    expect(args.p_attendance).toBe(attendance);
    expect(args.p_rule).toBe(rule);
  });

  it("leaves the source payload untouched", () => {
    type Payload = { name: string; phone?: string };
    const value: Payload = { name: "Alpha" };

    toRpcArgs(value, ["name", "phone"] as const);

    expect(value).toEqual({ name: "Alpha" });
    expect("phone" in value).toBe(false);
  });

  it("produces a record assignable to a representative explicit Args type", () => {
    // Mirrors a real pair: a validator-owned payload (optional/nullable domain
    // fields) against a hand-pinned Args entry (required, null-widened).
    type Payload = {
      full_name: string;
      email?: string;
      notes: string | null;
      active: boolean;
    };
    type Args = {
      p_full_name: string;
      p_email: string | null;
      p_notes: string | null;
      p_active: boolean;
    };
    const payload: Payload = { full_name: "A", notes: null, active: true };

    const args = toRpcArgs(payload, [
      "full_name",
      "email",
      "notes",
      "active",
    ] as const);

    expectTypeOf(args).toEqualTypeOf<Args>();

    // A key missing from the list is a compile error at the Args boundary --
    // the produced type lacks p_email, so the assignment must not typecheck.
    // @ts-expect-error p_email is required by Args but "email" was not listed
    const missing: Args = toRpcArgs(payload, [
      "full_name",
      "notes",
      "active",
    ] as const);
    expect(missing).toBeDefined();

    expect(args).toEqual({
      p_full_name: "A",
      p_email: null,
      p_notes: null,
      p_active: true,
    });
  });
});
