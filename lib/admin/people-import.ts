// People import (#165): pure CSV/bulk parse + validation.
//
// The deepest new console module: given a bulk CSV payload, produce
// `{ rowsToCreate, perRowErrors }`. Well-formed rows are prepared for creation;
// malformed rows produce per-row errors WITHOUT aborting the whole batch, so the
// operator can fix the bad rows and re-import. No I/O — the action layer takes
// `rowsToCreate` to the audited super-admin write path; this module only parses
// and validates, so it is isolation-testable with bare strings.
//
// Expected CSV shape: a header row naming columns, then one person per line.
// Recognised columns (case-insensitive, order-independent):
//   * full_name (required)
//   * email     (optional; must look like an email if present)
//   * phone     (optional)
//   * role      (optional; "leader" | "member"; defaults to "member")

// The kind of person a row creates. Leaders become auth-capable leader profiles;
// members are non-auth participant records. Mirrors the existing
// admin_create_leader_profile / admin_create_member split.
export type PersonImportRole = "leader" | "member";

// A validated, ready-to-create person. The action layer maps this to the bulk
// import RPC; this module guarantees the shape and that required fields are present.
export type PersonImportRow = {
  full_name: string;
  email: string | null;
  phone: string | null;
  role: PersonImportRole;
};

// A per-row failure. `line` is the 1-based source line number (the header is
// line 1, so the first data row is line 2) so the operator can locate the bad
// row in their file. `errors` lists every problem with that row.
export type PersonImportRowError = {
  line: number;
  raw: string;
  errors: string[];
};

export type PeopleImportResult = {
  rowsToCreate: PersonImportRow[];
  perRowErrors: PersonImportRowError[];
};

const RECOGNISED_COLUMNS = ["full_name", "email", "phone", "role"] as const;
type RecognisedColumn = (typeof RECOGNISED_COLUMNS)[number];

// Maximum rows accepted in a single import, mirrored by the RPC. Keeps a paste
// from creating an unbounded batch.
export const PEOPLE_IMPORT_MAX_ROWS = 500;

// Minimal, dependency-free CSV line splitter: supports double-quoted fields
// (with "" as an escaped quote) and commas inside quotes. Sufficient for the
// simple people CSV we accept; not a full RFC-4180 parser.
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function normaliseHeader(value: string): string {
  return value.trim().toLowerCase();
}

// A lightweight, deliberately permissive email check: a single @ with non-empty
// local and domain parts and a dot in the domain. The auth provider does the
// authoritative check; this only catches obvious paste errors per-row.
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseRole(value: string): PersonImportRole | "invalid" {
  const v = value.trim().toLowerCase();
  if (v === "" || v === "member") return "member";
  if (v === "leader") return "leader";
  return "invalid";
}

// Parse a bulk CSV payload into rows-to-create and per-row errors.
//
// Batch-level failures (no payload, no header, no recognisable columns, no
// full_name column, too many rows) surface as a single synthetic row error at
// line 0 so the caller always gets a result rather than a thrown exception.
export function parsePeopleImport(payload: string): PeopleImportResult {
  const empty: PeopleImportResult = { rowsToCreate: [], perRowErrors: [] };

  if (typeof payload !== "string" || payload.trim().length === 0) {
    return {
      ...empty,
      perRowErrors: [
        {
          line: 0,
          raw: "",
          errors: ["The import is empty. Paste or upload CSV rows."],
        },
      ],
    };
  }

  // Split on newlines, drop a trailing empty line, but keep line numbers aligned
  // to the original source (header is line 1).
  const lines = payload.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }
  if (lines.length === 0) {
    return {
      ...empty,
      perRowErrors: [
        {
          line: 0,
          raw: "",
          errors: ["The import is empty. Paste or upload CSV rows."],
        },
      ],
    };
  }

  const headerCells = splitCsvLine(lines[0]).map(normaliseHeader);
  const columnIndex = new Map<RecognisedColumn, number>();
  for (const column of RECOGNISED_COLUMNS) {
    const idx = headerCells.indexOf(column);
    if (idx !== -1) columnIndex.set(column, idx);
  }

  if (!columnIndex.has("full_name")) {
    return {
      ...empty,
      perRowErrors: [
        {
          line: 1,
          raw: lines[0],
          errors: [
            "The header row must include a 'full_name' column. Recognised columns: full_name, email, phone, role.",
          ],
        },
      ],
    };
  }

  const dataLines = lines.slice(1);
  if (
    dataLines.filter((l) => l.trim() !== "").length > PEOPLE_IMPORT_MAX_ROWS
  ) {
    return {
      ...empty,
      perRowErrors: [
        {
          line: 0,
          raw: "",
          errors: [
            `Too many rows. Import at most ${PEOPLE_IMPORT_MAX_ROWS} people per batch.`,
          ],
        },
      ],
    };
  }

  const result: PeopleImportResult = { rowsToCreate: [], perRowErrors: [] };
  const seenEmails = new Set<string>();

  dataLines.forEach((rawLine, index) => {
    const line = index + 2; // header is line 1
    if (rawLine.trim() === "") {
      // A blank interior line is skipped silently rather than erroring.
      return;
    }

    const cells = splitCsvLine(rawLine);
    const cellAt = (column: RecognisedColumn): string => {
      const idx = columnIndex.get(column);
      if (idx === undefined) return "";
      return (cells[idx] ?? "").trim();
    };

    const rowErrors: string[] = [];

    const fullName = cellAt("full_name");
    if (fullName === "") {
      rowErrors.push("full_name is required.");
    }

    const emailRaw = cellAt("email");
    let email: string | null = null;
    if (emailRaw !== "") {
      if (!looksLikeEmail(emailRaw)) {
        rowErrors.push(`"${emailRaw}" is not a valid email address.`);
      } else {
        const lower = emailRaw.toLowerCase();
        if (seenEmails.has(lower)) {
          rowErrors.push(`Duplicate email "${emailRaw}" within this import.`);
        } else {
          seenEmails.add(lower);
          email = emailRaw;
        }
      }
    }

    const phoneRaw = cellAt("phone");
    const phone = phoneRaw === "" ? null : phoneRaw;

    const role = parseRole(cellAt("role"));
    if (role === "invalid") {
      rowErrors.push(
        `Role "${cellAt("role")}" is not allowed. Use "leader" or "member".`
      );
    }

    // A leader needs an email (it becomes an auth-capable profile); a member may
    // be email-less. Only enforce once we know the row is otherwise a leader.
    if (role === "leader" && email === null && !rowErrors.length) {
      rowErrors.push("A leader row requires a valid email address.");
    }

    if (rowErrors.length > 0) {
      result.perRowErrors.push({ line, raw: rawLine, errors: rowErrors });
      return;
    }

    result.rowsToCreate.push({
      full_name: fullName,
      email,
      phone,
      role: role as PersonImportRole,
    });
  });

  return result;
}
