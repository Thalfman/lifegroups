import { describe, it, expect } from "vitest";

import {
  parsePeopleImport,
  PEOPLE_IMPORT_MAX_ROWS,
} from "@/lib/admin/people-import";

describe("people-import", () => {
  it("parses well-formed rows into rowsToCreate", () => {
    const csv = [
      "full_name,email,phone,role",
      "Alice Adams,alice@example.com,555-1000,leader",
      "Bob Brown,,555-2000,member",
      "Carol Clark,carol@example.com,,member",
    ].join("\n");
    const { rowsToCreate, perRowErrors } = parsePeopleImport(csv);
    expect(perRowErrors).toEqual([]);
    expect(rowsToCreate).toEqual([
      {
        full_name: "Alice Adams",
        email: "alice@example.com",
        phone: "555-1000",
        role: "leader",
      },
      {
        full_name: "Bob Brown",
        email: null,
        phone: "555-2000",
        role: "member",
      },
      {
        full_name: "Carol Clark",
        email: "carol@example.com",
        phone: null,
        role: "member",
      },
    ]);
  });

  it("defaults a missing role to member and tolerates column reordering", () => {
    const csv = ["email,full_name", "x@example.com,Dana Day"].join("\n");
    const { rowsToCreate } = parsePeopleImport(csv);
    expect(rowsToCreate).toEqual([
      {
        full_name: "Dana Day",
        email: "x@example.com",
        phone: null,
        role: "member",
      },
    ]);
  });

  it("reports malformed rows per-row without aborting the batch", () => {
    const csv = [
      "full_name,email,role",
      "Good One,good@example.com,member",
      ",missing@example.com,member", // missing full_name
      "Bad Email,not-an-email,member", // bad email
      "Leader No Email,,leader", // leader requires email
      "Another Good,fine@example.com,leader",
    ].join("\n");
    const { rowsToCreate, perRowErrors } = parsePeopleImport(csv);
    // The two good rows still import.
    expect(rowsToCreate.map((r) => r.full_name)).toEqual([
      "Good One",
      "Another Good",
    ]);
    // Three rows fail, each with its source line number (header is line 1).
    expect(perRowErrors.map((e) => e.line)).toEqual([3, 4, 5]);
    expect(perRowErrors[0].errors[0]).toMatch(/full_name is required/);
    expect(perRowErrors[1].errors[0]).toMatch(/not a valid email/);
    expect(perRowErrors[2].errors[0]).toMatch(/leader row requires/i);
  });

  it("flags duplicate emails within the import", () => {
    const csv = [
      "full_name,email",
      "First,dup@example.com",
      "Second,DUP@example.com",
    ].join("\n");
    const { rowsToCreate, perRowErrors } = parsePeopleImport(csv);
    expect(rowsToCreate.map((r) => r.full_name)).toEqual(["First"]);
    expect(perRowErrors).toHaveLength(1);
    expect(perRowErrors[0].errors[0]).toMatch(/duplicate email/i);
  });

  it("skips blank interior lines and trailing whitespace lines", () => {
    const csv = ["full_name,email", "Solo,solo@example.com", "", "   "].join(
      "\n"
    );
    const { rowsToCreate, perRowErrors } = parsePeopleImport(csv);
    expect(rowsToCreate).toHaveLength(1);
    expect(perRowErrors).toEqual([]);
  });

  it("trims whitespace around cells", () => {
    const csv = ["full_name, email ", "  Spacey Sam ,  sam@example.com  "].join(
      "\n"
    );
    const { rowsToCreate } = parsePeopleImport(csv);
    expect(rowsToCreate[0]).toEqual({
      full_name: "Spacey Sam",
      email: "sam@example.com",
      phone: null,
      role: "member",
    });
  });

  it("supports quoted fields containing commas", () => {
    const csv = ["full_name,email", '"Adams, Alice",alice@example.com'].join(
      "\n"
    );
    const { rowsToCreate } = parsePeopleImport(csv);
    expect(rowsToCreate[0].full_name).toBe("Adams, Alice");
  });

  it("returns a batch-level error for an empty payload", () => {
    expect(parsePeopleImport("").perRowErrors[0].errors[0]).toMatch(/empty/i);
    expect(parsePeopleImport("   ").perRowErrors[0].errors[0]).toMatch(
      /empty/i
    );
    expect(parsePeopleImport("").rowsToCreate).toEqual([]);
  });

  it("returns a header error when full_name is missing from the header", () => {
    const csv = ["email,phone", "x@example.com,555"].join("\n");
    const { rowsToCreate, perRowErrors } = parsePeopleImport(csv);
    expect(rowsToCreate).toEqual([]);
    expect(perRowErrors[0].line).toBe(1);
    expect(perRowErrors[0].errors[0]).toMatch(/full_name/);
  });

  it("rejects a batch over the row limit", () => {
    const rows = ["full_name,email"];
    for (let i = 0; i < PEOPLE_IMPORT_MAX_ROWS + 1; i += 1) {
      rows.push(`Person ${i},p${i}@example.com`);
    }
    const { rowsToCreate, perRowErrors } = parsePeopleImport(rows.join("\n"));
    expect(rowsToCreate).toEqual([]);
    expect(perRowErrors[0].errors[0]).toMatch(/too many rows/i);
  });
});
