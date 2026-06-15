import {
  KNOWN_TEST_EMAILS,
  TEST_GROUP_SPECS,
  buildSecretSet,
  findAuthUserByEmail,
  loadEnvLocal,
  makeServiceClient,
  preflight,
  redact,
  safeHost,
  type TestUserSpec,
} from "./test-auth-shared";

type GroupRow = { id: string; name: string; lifecycle_status: string };
type ProfileRow = {
  id: string;
  email: string;
  role: string;
  status: string;
  full_name: string;
  auth_user_id: string | null;
};

const DEMO_SAFE_GROUP_NAMES_A = [
  "Northside Young Adults",
  "Westside Families",
  "TEST Life Group A",
];
const DEMO_SAFE_GROUP_NAMES_B = [
  "Downtown Professionals",
  "Eastside Community",
  "TEST Life Group B",
];

function isDryRun(): boolean {
  return process.argv.slice(2).includes("--dry-run");
}

async function resolveTestGroup(
  client: ReturnType<typeof makeServiceClient>,
  key: "A" | "B",
  dryRun: boolean,
  log: (line: string) => void
): Promise<{
  id: string;
  name: string;
  action: "reused" | "created" | "dry-run";
} | null> {
  const candidates =
    key === "A" ? DEMO_SAFE_GROUP_NAMES_A : DEMO_SAFE_GROUP_NAMES_B;
  const { data: existing, error } = await client
    .from("groups")
    .select("id, name, lifecycle_status")
    .in("name", candidates)
    .eq("lifecycle_status", "active");
  if (error)
    throw new Error(`groups lookup failed for key ${key}: ${error.message}`);
  const rows = (existing ?? []) as GroupRow[];
  if (rows.length > 0) {
    const pick =
      rows.find((r) => r.name === TEST_GROUP_SPECS[key].name) ?? rows[0];
    return { id: pick.id, name: pick.name, action: "reused" };
  }

  const spec = TEST_GROUP_SPECS[key];
  if (dryRun) {
    log(
      `  group[${key}]: would create '${spec.name}' (${spec.meeting_day} ${spec.meeting_time})`
    );
    return {
      id: "00000000-0000-0000-0000-000000000000",
      name: spec.name,
      action: "dry-run",
    };
  }
  const { data, error: insErr } = await client
    .from("groups")
    .insert({
      name: spec.name,
      meeting_day: spec.meeting_day,
      meeting_time: spec.meeting_time,
      meeting_frequency: spec.meeting_frequency,
      meeting_week_parity: spec.meeting_week_parity,
      lifecycle_status: spec.lifecycle_status,
      health_status: spec.health_status,
    })
    .select("id, name")
    .single();
  if (insErr)
    throw new Error(`group insert failed for key ${key}: ${insErr.message}`);
  return {
    id: data.id as string,
    name: data.name as string,
    action: "created",
  };
}

async function upsertAuthUser(
  client: ReturnType<typeof makeServiceClient>,
  spec: TestUserSpec & { email: string; password: string },
  dryRun: boolean,
  log: (line: string) => void
): Promise<{ id: string; action: "created" | "updated" | "dry-run" }> {
  const existing = await findAuthUserByEmail(client, spec.email);
  if (existing) {
    if (dryRun) {
      log(
        `  auth: would reset password and confirm email for existing user (${spec.email})`
      );
      return { id: existing.id, action: "dry-run" };
    }
    const { error } = await client.auth.admin.updateUserById(existing.id, {
      password: spec.password,
      email_confirm: true,
    });
    if (error) throw new Error(`updateUserById failed: ${error.message}`);
    return { id: existing.id, action: "updated" };
  }
  if (dryRun) {
    log(`  auth: would create new auth user for ${spec.email}`);
    return { id: "00000000-0000-0000-0000-000000000000", action: "dry-run" };
  }
  const { data, error } = await client.auth.admin.createUser({
    email: spec.email,
    password: spec.password,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser failed: ${error.message}`);
  const user = data?.user;
  if (!user?.id) throw new Error("createUser returned no user id");
  return { id: user.id, action: "created" };
}

async function upsertProfile(
  client: ReturnType<typeof makeServiceClient>,
  spec: TestUserSpec & { email: string },
  authUserId: string,
  dryRun: boolean,
  log: (line: string) => void
): Promise<{
  id: string;
  action: "created" | "updated" | "skipped";
  reason?: string;
}> {
  const { data: existing, error } = await client
    .from("profiles")
    .select("id, email, role, status, full_name, auth_user_id")
    .eq("email", spec.email)
    .maybeSingle();
  if (error) throw new Error(`profile lookup failed: ${error.message}`);

  if (existing && (existing as ProfileRow).role === "super_admin") {
    log(`  profile: SKIP — refusing to overwrite super_admin profile`);
    return {
      id: (existing as ProfileRow).id,
      action: "skipped",
      reason: "refusing to overwrite super_admin profile",
    };
  }

  if (existing) {
    if (dryRun) {
      log(
        `  profile: would update role=${spec.role}, status=active, link auth_user_id`
      );
      return {
        id: (existing as ProfileRow).id,
        action: "skipped",
        reason: "dry-run",
      };
    }
    const { error: updErr } = await client
      .from("profiles")
      .update({
        auth_user_id: authUserId,
        role: spec.role,
        status: "active",
        full_name: spec.fullName,
      })
      .eq("id", (existing as ProfileRow).id);
    if (updErr) throw new Error(`profile update failed: ${updErr.message}`);
    return { id: (existing as ProfileRow).id, action: "updated" };
  }

  if (dryRun) {
    log(`  profile: would insert (${spec.role}, active)`);
    return {
      id: "00000000-0000-0000-0000-000000000000",
      action: "skipped",
      reason: "dry-run",
    };
  }
  const { data, error: insErr } = await client
    .from("profiles")
    .insert({
      auth_user_id: authUserId,
      email: spec.email,
      full_name: spec.fullName,
      role: spec.role,
      status: "active",
    })
    .select("id")
    .single();
  if (insErr) throw new Error(`profile insert failed: ${insErr.message}`);
  return { id: data.id as string, action: "created" };
}

async function upsertGroupLeader(
  client: ReturnType<typeof makeServiceClient>,
  spec: TestUserSpec,
  profileId: string,
  groupId: string,
  dryRun: boolean,
  log: (line: string) => void
): Promise<void> {
  if (!spec.groupRole) return;
  const { data: existing, error } = await client
    .from("group_leaders")
    .select("id, active, role")
    .eq("group_id", groupId)
    .eq("profile_id", profileId)
    .eq("role", spec.groupRole)
    .maybeSingle();
  if (error) throw new Error(`group_leaders lookup failed: ${error.message}`);

  if (existing) {
    if ((existing as { active: boolean }).active) {
      log(`  group_leaders: already active (${spec.groupRole})`);
      return;
    }
    if (dryRun) {
      log(`  group_leaders: would reactivate (${spec.groupRole})`);
      return;
    }
    const { error: updErr } = await client
      .from("group_leaders")
      .update({ active: true })
      .eq("id", (existing as { id: string }).id);
    if (updErr)
      throw new Error(`group_leaders reactivate failed: ${updErr.message}`);
    log(`  group_leaders: reactivated (${spec.groupRole})`);
    return;
  }

  if (dryRun) {
    log(`  group_leaders: would insert (${spec.groupRole})`);
    return;
  }
  const { error: insErr } = await client
    .from("group_leaders")
    .insert({
      group_id: groupId,
      profile_id: profileId,
      role: spec.groupRole,
      active: true,
    });
  if (insErr) throw new Error(`group_leaders insert failed: ${insErr.message}`);
  log(`  group_leaders: inserted (${spec.groupRole})`);
}

async function upsertOverShepherdCoverage(
  client: ReturnType<typeof makeServiceClient>,
  spec: TestUserSpec & { email: string },
  coveredLeaderProfileId: string,
  dryRun: boolean,
  log: (line: string) => void
): Promise<void> {
  // Bridge the Over-Shepherd profile to a roster row by email (the surface keys
  // coverage off the over_shepherds roster, matched case-insensitively on
  // email), then cover the seeded leader so /over-shepherd renders a real roster.
  const { data: existingRoster, error: rosterLookupErr } = await client
    .from("over_shepherds")
    .select("id, active, archived_at")
    .ilike("email", spec.email)
    .maybeSingle();
  if (rosterLookupErr) {
    throw new Error(`over_shepherds lookup failed: ${rosterLookupErr.message}`);
  }

  let rosterId: string;
  if (existingRoster) {
    rosterId = (existingRoster as { id: string }).id;
    if (dryRun) {
      log(`  over_shepherds: would reactivate roster row`);
      return;
    }
    const { error: updErr } = await client
      .from("over_shepherds")
      .update({ active: true, archived_at: null })
      .eq("id", rosterId);
    if (updErr)
      throw new Error(`over_shepherds reactivate failed: ${updErr.message}`);
    log(`  over_shepherds: reactivated roster row`);
  } else {
    if (dryRun) {
      log(`  over_shepherds: would insert roster row`);
      return;
    }
    const { data, error: insErr } = await client
      .from("over_shepherds")
      .insert({ full_name: spec.fullName, email: spec.email, active: true })
      .select("id")
      .single();
    if (insErr)
      throw new Error(`over_shepherds insert failed: ${insErr.message}`);
    rosterId = data.id as string;
    log(`  over_shepherds: inserted roster row`);
  }

  const { data: existingCoverage, error: covLookupErr } = await client
    .from("shepherd_coverage_assignments")
    .select("id, active")
    .eq("over_shepherd_id", rosterId)
    .eq("shepherd_profile_id", coveredLeaderProfileId)
    .maybeSingle();
  if (covLookupErr) {
    throw new Error(`coverage lookup failed: ${covLookupErr.message}`);
  }

  if (existingCoverage) {
    if ((existingCoverage as { active: boolean }).active) {
      log(`  coverage: already active (over leader1)`);
      return;
    }
    const { error: updErr } = await client
      .from("shepherd_coverage_assignments")
      .update({ active: true, ended_at: null })
      .eq("id", (existingCoverage as { id: string }).id);
    if (updErr)
      throw new Error(`coverage reactivate failed: ${updErr.message}`);
    log(`  coverage: reactivated (over leader1)`);
    return;
  }

  const { error: covInsErr } = await client
    .from("shepherd_coverage_assignments")
    .insert({
      over_shepherd_id: rosterId,
      shepherd_profile_id: coveredLeaderProfileId,
      active: true,
    });
  if (covInsErr)
    throw new Error(`coverage insert failed: ${covInsErr.message}`);
  log(`  coverage: inserted (over leader1)`);
}

async function main(): Promise<number> {
  loadEnvLocal();
  const dryRun = isDryRun();

  const result = preflight();
  if (!result.ok) {
    for (const err of result.errors) console.error(err);
    return 2;
  }
  const env = result.env;
  const secrets = buildSecretSet(env);
  const safeLog = (line: string) => console.log(redact(line, secrets));

  safeLog(
    `seed-test-auth-users: target=${safeHost(env.supabaseUrl)} remote=${env.isRemoteSupabase} dryRun=${dryRun}`
  );
  if (env.isRemoteSupabase) {
    safeLog(
      "WARNING: targeting a REMOTE Supabase project. Test users will be created/updated."
    );
    safeLog(`  emails: ${KNOWN_TEST_EMAILS.join(", ")}`);
  }

  const client = makeServiceClient(env);
  const groupCache: Partial<Record<"A" | "B", { id: string; name: string }>> =
    {};
  const profileCache: Partial<Record<string, string>> = {};
  let exitCode = 0;

  for (const spec of env.specs) {
    safeLog(`\n${spec.key} (${spec.email}) [${spec.role}]`);
    try {
      const auth = await upsertAuthUser(client, spec, dryRun, safeLog);
      safeLog(`  auth: ${auth.action}`);

      const profile = await upsertProfile(
        client,
        spec,
        auth.id,
        dryRun,
        safeLog
      );
      if (profile.action === "skipped" && profile.reason !== "dry-run") {
        safeLog(`  profile: ${profile.action} (${profile.reason ?? ""})`);
        continue;
      }
      if (profile.action !== "skipped") safeLog(`  profile: ${profile.action}`);
      profileCache[spec.key] = profile.id;

      // Over-Shepherds cover a seeded leader so /over-shepherd renders a real
      // surface. The OS spec is ordered after the leaders, so the covered
      // leader's profile id is already cached here (unless skipped in dry-run).
      if (spec.role === "over_shepherd" && spec.coversLeaderKey) {
        const coveredId = profileCache[spec.coversLeaderKey];
        if (!coveredId) {
          safeLog(
            `  coverage: skipped — covered leader '${spec.coversLeaderKey}' has no profile id yet`
          );
        } else {
          await upsertOverShepherdCoverage(
            client,
            spec,
            coveredId,
            dryRun,
            safeLog
          );
        }
      }

      if (spec.groupKey && spec.groupRole) {
        if (!groupCache[spec.groupKey]) {
          const g = await resolveTestGroup(
            client,
            spec.groupKey,
            dryRun,
            safeLog
          );
          if (!g) throw new Error(`failed to resolve group ${spec.groupKey}`);
          groupCache[spec.groupKey] = { id: g.id, name: g.name };
          safeLog(`  group[${spec.groupKey}]: ${g.action} (${g.name})`);
        } else {
          safeLog(
            `  group[${spec.groupKey}]: cached (${groupCache[spec.groupKey]!.name})`
          );
        }
        if (
          dryRun &&
          profile.action === "skipped" &&
          profile.reason === "dry-run"
        ) {
          safeLog(`  group_leaders: skipped in dry-run (no profile id)`);
        } else {
          await upsertGroupLeader(
            client,
            spec,
            profile.id,
            groupCache[spec.groupKey]!.id,
            dryRun,
            safeLog
          );
        }
      }
    } catch (err) {
      exitCode = 1;
      const msg = err instanceof Error ? err.message : String(err);
      safeLog(`  ERROR: ${redact(msg, secrets)}`);
    }
  }

  safeLog(`\nseed-test-auth-users: done (exitCode=${exitCode})`);
  return exitCode;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(msg);
    process.exit(1);
  });
