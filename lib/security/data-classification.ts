// Sensitive-data classification manifest (issue #694, PR3).
//
// A single, typed, test-importable source of truth that maps the real schema's
// sensitive tables and columns to a classification. It is the foundation later
// checks enforce: the RLS coverage manifest (#693) derives its "tables that need
// an RLS assertion" set from `sensitiveTables()` here, so the two can't drift.
//
// Table/column names are taken from `types/database.ts` (the hand-rolled row
// types that are the trust boundary) and the `supabase/migrations/` schema.
// The taxonomy, expectations, and the `policy_tbd` convention are documented in
// `docs/architecture/DATA_CLASSIFICATION.md`.

/** The classification taxonomy (see DATA_CLASSIFICATION.md for expectations). */
export const CLASSIFICATIONS = [
  "operational_metadata",
  "pii",
  "sensitive_care",
  "prayer_request",
  "admin_private",
  "encrypted_private",
  "audit",
  "invite_auth",
  "danger_zone_snapshot",
  // Unresolved policy: treated as SENSITIVE until classified more narrowly, so
  // it never silently lands in logs/audit metadata.
  "policy_tbd",
] as const;

export type Classification = (typeof CLASSIFICATIONS)[number];

// Only operational metadata is non-sensitive. Everything else — including the
// catch-all `policy_tbd` — is sensitive by default (the "sensitive until proven
// otherwise" rule). Keeping the non-sensitive set tiny means a new
// classification is sensitive unless explicitly added here.
const NON_SENSITIVE_CLASSIFICATIONS: ReadonlySet<Classification> = new Set([
  "operational_metadata",
]);

/** Is this classification considered sensitive (kept out of logs/audit metadata)? */
export function isSensitive(classification: Classification): boolean {
  return !NON_SENSITIVE_CLASSIFICATIONS.has(classification);
}

export interface ColumnClassification {
  readonly column: string;
  readonly classification: Classification;
  readonly note?: string;
}

export interface TableClassification {
  readonly table: string;
  /** The table's baseline classification (its most sensitive rows/columns). */
  readonly classification: Classification;
  /** Per-column classifications that differ from, or sharpen, the baseline. */
  readonly columns?: readonly ColumnClassification[];
  /** True when the policy for this table/columns is genuinely undecided. */
  readonly policyTbd?: boolean;
  readonly note?: string;
}

// The default rule, encoded: a column whose NAME suggests pastoral care, prayer,
// private notes, personal contact data, tokens, secrets, or freeform user text
// is sensitive until proven otherwise. Used by the manifest test to prove no
// operational_metadata table hides a sensitive-looking column, and available to
// callers that need to classify an unlisted column conservatively.
const SENSITIVE_NAME_PATTERNS: readonly RegExp[] = [
  /note/i, // leader_note, admin_note, additional_note, admin_metric_notes, notes
  /body/i, // care_notes.body, prayer_requests.body
  /summary/i, // shepherd_care_admin_notes.admin_summary
  /reason/i, // override_reason, account_deletion_requests.reason
  /email/i,
  /phone/i,
  /address/i,
  /household/i,
  /token|secret/i,
  /cipher/i, // ciphertext
  /(^|_)iv($|_)/i, // initialization vector
  /dek|wrapped|salt|credential/i, // key material
  /snapshot|row_snapshot|payload/i, // danger-zone before/after snapshots
];

/** The encoded default rule: does this column name look sensitive? */
export function looksSensitiveByName(column: string): boolean {
  return SENSITIVE_NAME_PATTERNS.some((re) => re.test(column));
}

// ---------------------------------------------------------------------------
// The manifest. Sensitive tables are classified explicitly (table baseline +
// the columns that carry the sensitivity). Purely-operational config/metadata
// tables are intentionally NOT enumerated here — absence means "operational,
// non-sensitive" — except where they hold a freeform column, which is then
// classified so the default rule is demonstrably applied.
// ---------------------------------------------------------------------------
export const DATA_CLASSIFICATION: readonly TableClassification[] = [
  // --- PII -----------------------------------------------------------------
  {
    table: "profiles",
    classification: "pii",
    columns: [
      { column: "full_name", classification: "pii" },
      { column: "email", classification: "pii" },
      { column: "phone", classification: "pii" },
    ],
    note: "Auth-login identities; role/status are operational, contact fields are PII.",
  },
  {
    table: "members",
    classification: "pii",
    columns: [
      { column: "full_name", classification: "pii" },
      { column: "email", classification: "pii" },
      { column: "phone", classification: "pii" },
      { column: "household_name", classification: "pii" },
      {
        column: "care_sensitivity_flag",
        classification: "sensitive_care",
        note: "Pastoral-sensitivity indicator.",
      },
    ],
  },
  {
    table: "guests",
    classification: "pii",
    columns: [
      { column: "full_name", classification: "pii" },
      { column: "email", classification: "pii" },
      { column: "phone", classification: "pii" },
      { column: "notes", classification: "admin_private" },
    ],
  },
  {
    table: "prospects",
    classification: "pii",
    columns: [
      { column: "full_name", classification: "pii" },
      { column: "email", classification: "pii" },
      { column: "phone", classification: "pii" },
      { column: "additional_note", classification: "admin_private" },
    ],
  },
  {
    table: "over_shepherds",
    classification: "pii",
    columns: [
      { column: "full_name", classification: "pii" },
      { column: "email", classification: "pii" },
      { column: "phone", classification: "pii" },
      { column: "notes", classification: "admin_private" },
    ],
  },
  {
    table: "account_deletion_requests",
    classification: "pii",
    columns: [
      {
        column: "reason",
        classification: "policy_tbd",
        note: "Freeform self-service reason; could carry personal context.",
      },
    ],
    policyTbd: true,
  },

  // --- Sensitive care data -------------------------------------------------
  {
    table: "care_notes",
    classification: "sensitive_care",
    columns: [
      {
        column: "body",
        classification: "sensitive_care",
        note: "Author-private; sealed until the subject's transparency grant flips.",
      },
    ],
  },
  {
    table: "shepherd_care_profiles",
    classification: "sensitive_care",
    note: "Care status/cadence for Leaders; admin-only surface.",
  },
  {
    table: "shepherd_care_interactions",
    classification: "sensitive_care",
    columns: [{ column: "notes", classification: "sensitive_care" }],
  },
  {
    table: "member_care_profiles",
    classification: "sensitive_care",
    columns: [{ column: "admin_summary", classification: "admin_private" }],
    note: "Member-half of Care (flag-gated); admin-only summary, admin-read.",
  },
  {
    table: "member_care_interactions",
    classification: "sensitive_care",
    columns: [{ column: "notes", classification: "sensitive_care" }],
    note: "Member care interaction history; admin-read.",
  },
  {
    table: "shepherd_care_follow_ups",
    classification: "sensitive_care",
    columns: [{ column: "notes", classification: "sensitive_care" }],
  },
  {
    table: "attendance_sessions",
    classification: "sensitive_care",
    columns: [
      { column: "leader_note", classification: "sensitive_care" },
      { column: "admin_note", classification: "admin_private" },
    ],
  },
  {
    table: "group_health_updates",
    classification: "sensitive_care",
    columns: [
      { column: "leader_note", classification: "sensitive_care" },
      { column: "admin_note", classification: "admin_private" },
    ],
  },
  {
    table: "group_health_assessments",
    classification: "sensitive_care",
    columns: [
      { column: "spiritual_growth_note", classification: "sensitive_care" },
      { column: "override_reason", classification: "admin_private" },
    ],
  },
  {
    table: "follow_ups",
    classification: "sensitive_care",
    columns: [
      { column: "leader_visible_note", classification: "sensitive_care" },
      {
        column: "admin_private_note",
        classification: "admin_private",
        note: "Leader-invisible; never exposed on leader routes.",
      },
    ],
  },

  // --- Prayer request data -------------------------------------------------
  {
    table: "prayer_requests",
    classification: "prayer_request",
    columns: [
      {
        column: "body",
        classification: "prayer_request",
        note: "Author-private; same transparency model as care_notes.",
      },
    ],
  },

  // --- Admin-private data --------------------------------------------------
  {
    table: "shepherd_care_admin_notes",
    classification: "admin_private",
    columns: [{ column: "admin_summary", classification: "admin_private" }],
    note: "Ministry-Admin-only care summary, split out for RLS gating.",
  },
  {
    table: "groups",
    classification: "operational_metadata",
    columns: [{ column: "admin_notes", classification: "admin_private" }],
    note: "Group metadata is operational; admin_notes is admin-private.",
  },
  {
    table: "group_metric_settings",
    classification: "operational_metadata",
    columns: [
      { column: "admin_metric_notes", classification: "admin_private" },
    ],
  },

  // --- Encrypted private data (zero-knowledge, SC.4) -----------------------
  {
    table: "shepherd_care_private_notes",
    classification: "encrypted_private",
    columns: [
      {
        column: "ciphertext",
        classification: "encrypted_private",
        note: "AES-256-GCM, client-encrypted. Hidden even from the Super Admin.",
      },
      { column: "iv", classification: "encrypted_private" },
    ],
    note: "The one deliberate inversion of the oversight ladder.",
  },
  {
    table: "shepherd_care_note_key_slots",
    classification: "encrypted_private",
    columns: [
      { column: "wrapped_dek", classification: "encrypted_private" },
      { column: "wrap_iv", classification: "encrypted_private" },
      { column: "prf_salt", classification: "encrypted_private" },
      { column: "hkdf_salt", classification: "encrypted_private" },
      { column: "credential_id", classification: "encrypted_private" },
    ],
    note: "Per-creator wrapped DEK key material.",
  },

  // --- Audit data ----------------------------------------------------------
  {
    table: "audit_events",
    classification: "audit",
    note: "Append-only mutation spine; super_admin-only read.",
  },
  {
    table: "audit_events_archive",
    classification: "audit",
    note: "Purged audit rows; super_admin-only.",
  },
  {
    table: "group_status_history",
    classification: "audit",
    note: "Lifecycle/health change trail.",
  },

  // --- Invite / auth-adjacent ---------------------------------------------
  {
    table: "invitations",
    classification: "invite_auth",
    columns: [
      {
        column: "token_hash",
        classification: "invite_auth",
        note: "Hashed invite token; never log the raw token.",
      },
    ],
  },
  {
    table: "invite_redeem_throttle",
    classification: "invite_auth",
    columns: [{ column: "throttle_key", classification: "invite_auth" }],
    note: "Internal rate-limit ledger.",
  },

  // --- Danger-zone snapshots ----------------------------------------------
  {
    table: "tombstones",
    classification: "danger_zone_snapshot",
    columns: [
      { column: "row_snapshot", classification: "danger_zone_snapshot" },
      { column: "set_null_dependents", classification: "danger_zone_snapshot" },
    ],
    note: "Permanent-deletion before-image; super_admin-only.",
  },
  {
    table: "clean_slate_snapshots",
    classification: "danger_zone_snapshot",
    columns: [{ column: "payload", classification: "danger_zone_snapshot" }],
  },
  {
    table: "history_reset_snapshots",
    classification: "danger_zone_snapshot",
    columns: [{ column: "payload", classification: "danger_zone_snapshot" }],
  },
  {
    table: "attention_reset_snapshots",
    classification: "danger_zone_snapshot",
    columns: [{ column: "payload", classification: "danger_zone_snapshot" }],
  },
] as const;

/** Look up a table's classification entry, if it is in the manifest. */
export function tableClassification(
  table: string
): TableClassification | undefined {
  return DATA_CLASSIFICATION.find((t) => t.table === table);
}

/**
 * The set of tables classified as sensitive — the authoritative input to the
 * RLS coverage manifest (#693). A table is sensitive when its baseline is
 * sensitive OR any of its columns is.
 */
export function sensitiveTables(): string[] {
  return DATA_CLASSIFICATION.filter(
    (t) =>
      isSensitive(t.classification) ||
      (t.columns ?? []).some((c) => isSensitive(c.classification))
  )
    .map((t) => t.table)
    .sort();
}

/** Tables (or table+columns) whose policy is still undecided. */
export function policyTbdTables(): string[] {
  return DATA_CLASSIFICATION.filter((t) => t.policyTbd === true)
    .map((t) => t.table)
    .sort();
}
