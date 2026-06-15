import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export const KNOWN_TEST_EMAILS = [
  "test.admin@lifegroups.local",
  "test.overshepherd@lifegroups.local",
  "test.leader1@lifegroups.local",
  "test.leader2@lifegroups.local",
  "test.coleader@lifegroups.local",
] as const;

export type KnownTestEmail = (typeof KNOWN_TEST_EMAILS)[number];

export type TestUserKey =
  | "admin"
  | "overshepherd"
  | "leader1"
  | "leader2"
  | "coleader";

export type TestUserSpec = {
  key: TestUserKey;
  emailVar: string;
  passwordVar: string;
  expectedEmail: KnownTestEmail;
  fullName: string;
  role: "ministry_admin" | "over_shepherd" | "leader" | "co_leader";
  groupKey: "A" | "B" | null;
  groupRole: "leader" | "co_leader" | null;
  /**
   * For an Over-Shepherd: the leader spec this user actively covers, so the
   * seeded `/over-shepherd` surface renders a real (non-empty) roster instead
   * of an empty state. `null` for every non-Over-Shepherd spec.
   */
  coversLeaderKey: TestUserKey | null;
};

export const TEST_USER_SPECS: TestUserSpec[] = [
  {
    key: "admin",
    emailVar: "TEST_ADMIN_EMAIL",
    passwordVar: "TEST_ADMIN_PASSWORD",
    expectedEmail: "test.admin@lifegroups.local",
    fullName: "Test Ministry Admin",
    role: "ministry_admin",
    groupKey: null,
    groupRole: null,
    coversLeaderKey: null,
  },
  {
    key: "leader1",
    emailVar: "TEST_LEADER1_EMAIL",
    passwordVar: "TEST_LEADER1_PASSWORD",
    expectedEmail: "test.leader1@lifegroups.local",
    fullName: "Test Leader One",
    role: "leader",
    groupKey: "A",
    groupRole: "leader",
    coversLeaderKey: null,
  },
  {
    key: "leader2",
    emailVar: "TEST_LEADER2_EMAIL",
    passwordVar: "TEST_LEADER2_PASSWORD",
    expectedEmail: "test.leader2@lifegroups.local",
    fullName: "Test Leader Two",
    role: "leader",
    groupKey: "B",
    groupRole: "leader",
    coversLeaderKey: null,
  },
  {
    key: "coleader",
    emailVar: "TEST_COLEADER_EMAIL",
    passwordVar: "TEST_COLEADER_PASSWORD",
    expectedEmail: "test.coleader@lifegroups.local",
    fullName: "Test Co-Leader",
    role: "co_leader",
    groupKey: "A",
    groupRole: "co_leader",
    coversLeaderKey: null,
  },
  {
    // Ordered AFTER the leaders so leader1's profile exists when the seed wires
    // up this Over-Shepherd's coverage over it.
    key: "overshepherd",
    emailVar: "TEST_OVERSHEPHERD_EMAIL",
    passwordVar: "TEST_OVERSHEPHERD_PASSWORD",
    expectedEmail: "test.overshepherd@lifegroups.local",
    fullName: "Test Over-Shepherd",
    role: "over_shepherd",
    groupKey: null,
    groupRole: null,
    coversLeaderKey: "leader1",
  },
];

export type TestGroupKey = "A" | "B";

export const TEST_GROUP_SPECS: Record<
  TestGroupKey,
  {
    name: string;
    meeting_day: string;
    meeting_time: string;
    meeting_frequency: "weekly";
    meeting_week_parity: null;
    lifecycle_status: "active";
    health_status: "healthy";
  }
> = {
  A: {
    name: "TEST Life Group A",
    meeting_day: "Wednesday",
    meeting_time: "18:30",
    meeting_frequency: "weekly",
    meeting_week_parity: null,
    lifecycle_status: "active",
    health_status: "healthy",
  },
  B: {
    name: "TEST Life Group B",
    meeting_day: "Thursday",
    meeting_time: "18:30",
    meeting_frequency: "weekly",
    meeting_week_parity: null,
    lifecycle_status: "active",
    health_status: "healthy",
  },
};

export function loadEnvLocal(cwd: string = process.cwd()): void {
  const path = resolve(cwd, ".env.local");
  if (!existsSync(path)) return;
  const raw = readFileSync(path, "utf8");
  for (const lineRaw of raw.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line || line.startsWith("#")) continue;
    const stripped = line.replace(/^export\s+/, "");
    const eq = stripped.indexOf("=");
    if (eq <= 0) continue;
    const key = stripped.slice(0, eq).trim();
    let value = stripped.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export type RuntimeEnv = {
  supabaseUrl: string;
  serviceRoleKey: string;
  specs: Array<TestUserSpec & { email: string; password: string }>;
  isRemoteSupabase: boolean;
  allowRemote: boolean;
  isProduction: boolean;
};

function classifyUrlIsRemote(rawUrl: string): boolean {
  let host = "";
  try {
    host = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return true;
  }
  if (host === "localhost" || host === "127.0.0.1" || host === "::1")
    return false;
  if (host.endsWith(".supabase.internal")) return false;
  return true;
}

function isTruthyEnv(v: string | undefined): boolean {
  return v === "true";
}

export type GuardError = { fatal: true; message: string };

export function preflight(
  opts: { requireConfirmRemove?: boolean } = {}
): { ok: true; env: RuntimeEnv } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (!isTruthyEnv(process.env.ENABLE_TEST_AUTH_USERS)) {
    errors.push(
      "Refusing to run: set ENABLE_TEST_AUTH_USERS=true in your local environment to opt in."
    );
  }

  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  if (!supabaseUrl) {
    errors.push("Refusing to run: NEXT_PUBLIC_SUPABASE_URL is empty.");
  }

  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!serviceRoleKey) {
    errors.push("Refusing to run: SUPABASE_SERVICE_ROLE_KEY is empty.");
  }

  const resolvedSpecs: Array<
    TestUserSpec & { email: string; password: string }
  > = [];
  for (const spec of TEST_USER_SPECS) {
    const email = (process.env[spec.emailVar] ?? "").trim().toLowerCase();
    const password = process.env[spec.passwordVar] ?? "";
    if (!email) {
      errors.push(`Refusing to run: ${spec.emailVar} is empty.`);
    }
    if (!password) {
      errors.push(`Refusing to run: ${spec.passwordVar} is empty.`);
    }
    if (email && !(KNOWN_TEST_EMAILS as readonly string[]).includes(email)) {
      errors.push(
        `Refusing to run: ${spec.emailVar} must be one of the known test emails (${spec.expectedEmail}).`
      );
    }
    resolvedSpecs.push({ ...spec, email, password });
  }

  const isProduction = process.env.NODE_ENV === "production";
  const allowRemote = isTruthyEnv(
    process.env.ALLOW_TEST_USERS_ON_REMOTE_SUPABASE
  );
  const isRemoteSupabase = supabaseUrl
    ? classifyUrlIsRemote(supabaseUrl)
    : true;

  if (isProduction && !allowRemote) {
    errors.push(
      "Refusing to run: NODE_ENV=production and ALLOW_TEST_USERS_ON_REMOTE_SUPABASE is not set."
    );
  }

  if (isRemoteSupabase && !allowRemote) {
    errors.push(
      "Refusing to run: Supabase URL is not local. Set ALLOW_TEST_USERS_ON_REMOTE_SUPABASE=true to intentionally target a remote project."
    );
  }

  if (
    opts.requireConfirmRemove &&
    !isTruthyEnv(process.env.CONFIRM_REMOVE_TEST_AUTH_USERS)
  ) {
    errors.push(
      "Refusing to run: CONFIRM_REMOVE_TEST_AUTH_USERS=true is required to run the cleanup."
    );
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    env: {
      supabaseUrl,
      serviceRoleKey,
      specs: resolvedSpecs,
      isRemoteSupabase,
      allowRemote,
      isProduction,
    },
  };
}

export function makeServiceClient(env: RuntimeEnv): SupabaseClient {
  return createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function buildSecretSet(env: RuntimeEnv): Set<string> {
  const set = new Set<string>();
  set.add(env.serviceRoleKey);
  for (const s of env.specs) {
    if (s.password) set.add(s.password);
  }
  return set;
}

export function redact(message: string, secrets: Set<string>): string {
  let out = message;
  for (const secret of secrets) {
    if (!secret) continue;
    const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(escaped, "g"), "[REDACTED]");
  }
  out = out.replace(
    /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    "[REDACTED_JWT]"
  );
  return out;
}

export function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "[invalid-url]";
  }
}

export async function findAuthUserByEmail(
  client: SupabaseClient,
  email: string
): Promise<{ id: string; email: string | null } | null> {
  const target = email.toLowerCase();
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error)
      throw new Error(`listUsers failed on page ${page}: ${error.message}`);
    const users = data?.users ?? [];
    const match = users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (match) return { id: match.id, email: match.email ?? null };
    if (users.length < perPage) return null;
    page += 1;
    if (page > 50) return null;
  }
}
