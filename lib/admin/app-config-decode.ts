// Phase SAC.1 (#159): pure decoder for the Super Admin Console platform config.
//
// Mirrors the decodeMetricDefaults approach (lib/admin/metrics.ts): a single
// keyed-row jsonb value (platform_config.setting_value) is turned into a typed
// config shape, falling back to documented built-in defaults for any missing
// or malformed key. No I/O, no Supabase — the read model supplies the row, this
// module turns it into typed config, so it can be unit-tested with bare objects.
//
// The console_tracer_note is the foundation's round-trip tracer: a trivial
// editable string that proves store -> audited RPC -> RLS -> read-back before
// real feature flags and editable copy build on top.

// Local record guard. Kept self-contained (rather than importing from
// validation.ts) so the validator can depend on this module's constants
// without a circular import.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type AppConfig = {
  // Editable copy that round-trips through the audited write path as the
  // console foundation's tracer. Bounded to keep it a label, not a document.
  consoleTracerNote: string;
};

// Max length enforced in the UI, the validator, and the SECURITY DEFINER RPC.
// Keep all three in sync if this changes.
export const APP_CONFIG_TRACER_MAX_LENGTH = 200;

// Documented baseline. Mirrors the seed in the Phase SAC.1 migration; if you
// change one, change the other.
export const BUILT_IN_APP_CONFIG: AppConfig = {
  consoleTracerNote: "",
};

// The single jsonb key the tracer config persists under.
const CONSOLE_TRACER_NOTE_KEY = "console_tracer_note";

function readJsonString(
  source: Record<string, unknown> | null,
  key: string,
  fallback: string
): string {
  if (!source) return fallback;
  const raw = source[key];
  return typeof raw === "string" ? raw : fallback;
}

// Decode a platform_config keyed row into the typed AppConfig. A null row
// (never seeded, or read failed) decodes to the built-in defaults, so callers
// can treat "no row" as a safe no-op rather than an error.
export function decodeAppConfig(
  row: { setting_value: unknown } | null
): AppConfig {
  const raw = row?.setting_value;
  const source: Record<string, unknown> | null = isRecord(raw) ? raw : null;
  return {
    consoleTracerNote: readJsonString(
      source,
      CONSOLE_TRACER_NOTE_KEY,
      BUILT_IN_APP_CONFIG.consoleTracerNote
    ),
  };
}
