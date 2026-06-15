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
} from "./test-auth-shared";

type ProfileRow = { id: string; email: string; role: string; status: string };

const REMOVABLE_ROLES = new Set([
  "ministry_admin",
  "over_shepherd",
  "leader",
  "co_leader",
]);

async function deactivateOverShepherdLinks(
  client: ReturnType<typeof makeServiceClient>,
  email: string,
  dryRun: boolean,
  log: (line: string) => void
): Promise<void> {
  // The Over-Shepherd is bridged to a roster row by email; coverage assignments
  // reference that roster row. Deactivate both (soft — no hard delete) so the
  // seeded /over-shepherd surface goes empty, mirroring how leaders are removed.
  const { data: roster, error } = await client
    .from("over_shepherds")
    .select("id")
    .ilike("email", email);
  if (error) throw new Error(`over_shepherds lookup failed: ${error.message}`);
  const rosterIds = (roster ?? []).map((r) => (r as { id: string }).id);
  if (rosterIds.length === 0) {
    log(`  over_shepherds: no roster row for this email`);
    return;
  }
  if (dryRun) {
    log(
      `  coverage/over_shepherds: would deactivate ${rosterIds.length} roster row(s) + their coverage`
    );
    return;
  }
  // Only end CURRENTLY-active coverage. Filtering to active rows leaves any
  // prior ended_at untouched (no historical-date corruption) and makes repeated
  // cleanup idempotent — a second run matches nothing.
  const { error: covErr } = await client
    .from("shepherd_coverage_assignments")
    .update({ active: false, ended_at: new Date().toISOString().slice(0, 10) })
    .in("over_shepherd_id", rosterIds)
    .eq("active", true);
  if (covErr) throw new Error(`coverage deactivate failed: ${covErr.message}`);
  const { error: rosterErr } = await client
    .from("over_shepherds")
    .update({ active: false, archived_at: new Date().toISOString() })
    .in("id", rosterIds);
  if (rosterErr)
    throw new Error(`over_shepherds deactivate failed: ${rosterErr.message}`);
  log(`  coverage/over_shepherds: deactivated`);
}

function isDryRun(): boolean {
  return process.argv.slice(2).includes("--dry-run");
}

async function archiveTestGroup(
  client: ReturnType<typeof makeServiceClient>,
  key: "A" | "B",
  dryRun: boolean,
  log: (line: string) => void
): Promise<void> {
  const name = TEST_GROUP_SPECS[key].name;
  const { data: rows, error } = await client
    .from("groups")
    .select("id, lifecycle_status")
    .eq("name", name);
  if (error)
    throw new Error(`groups lookup failed for ${name}: ${error.message}`);
  const matches = (rows ?? []) as { id: string; lifecycle_status: string }[];
  if (matches.length === 0) {
    log(`  group[${name}]: not present`);
    return;
  }
  if (matches.length > 1) {
    log(
      `  group[${name}]: SKIP — ambiguous (${matches.length} rows). Resolve manually.`
    );
    return;
  }
  const group = matches[0];
  const { data: leaders, error: lErr } = await client
    .from("group_leaders")
    .select("id")
    .eq("group_id", group.id)
    .eq("active", true);
  if (lErr)
    throw new Error(`group_leaders count failed for ${name}: ${lErr.message}`);
  if ((leaders ?? []).length > 0) {
    log(`  group[${name}]: SKIP — still has active leaders attached`);
    return;
  }
  if (group.lifecycle_status === "closed") {
    log(`  group[${name}]: already closed`);
    return;
  }
  if (dryRun) {
    log(`  group[${name}]: would archive (lifecycle_status=closed)`);
    return;
  }
  const { error: updErr } = await client
    .from("groups")
    .update({ lifecycle_status: "closed", closed_at: new Date().toISOString() })
    .eq("id", group.id);
  if (updErr)
    throw new Error(`group archive failed for ${name}: ${updErr.message}`);
  log(`  group[${name}]: archived`);
}

async function main(): Promise<number> {
  loadEnvLocal();
  const dryRun = isDryRun();

  const result = preflight({ requireConfirmRemove: true });
  if (!result.ok) {
    for (const err of result.errors) console.error(err);
    return 2;
  }
  const env = result.env;
  const secrets = buildSecretSet(env);
  const safeLog = (line: string) => console.log(redact(line, secrets));

  safeLog(
    `remove-test-auth-users: target=${safeHost(env.supabaseUrl)} remote=${env.isRemoteSupabase} dryRun=${dryRun}`
  );

  const candidates = env.specs.filter((s) =>
    (KNOWN_TEST_EMAILS as readonly string[]).includes(s.email)
  );
  const skipped = env.specs.filter(
    (s) => !(KNOWN_TEST_EMAILS as readonly string[]).includes(s.email)
  );
  for (const s of skipped) {
    safeLog(
      `SKIP ${s.key}: env email '${s.email}' is not in KNOWN_TEST_EMAILS`
    );
  }

  const client = makeServiceClient(env);
  let exitCode = 0;

  for (const spec of candidates) {
    safeLog(`\n${spec.key} (${spec.email})`);
    try {
      const authUser = await findAuthUserByEmail(client, spec.email);
      if (authUser) {
        if (dryRun) {
          safeLog(`  auth: would delete (id=${authUser.id})`);
        } else {
          const { error } = await client.auth.admin.deleteUser(authUser.id);
          if (error) throw new Error(`deleteUser failed: ${error.message}`);
          safeLog(`  auth: deleted`);
        }
      } else {
        safeLog(`  auth: not present`);
      }

      const { data: existing, error: profErr } = await client
        .from("profiles")
        .select("id, email, role, status")
        .eq("email", spec.email)
        .maybeSingle();
      if (profErr) throw new Error(`profile lookup failed: ${profErr.message}`);
      const profile = existing as ProfileRow | null;

      if (!profile) {
        safeLog(`  profile: not present`);
        continue;
      }
      if (profile.role === "super_admin") {
        safeLog(`  profile: SKIP — refusing to deactivate super_admin profile`);
        continue;
      }
      if (!REMOVABLE_ROLES.has(profile.role)) {
        safeLog(`  profile: SKIP — unexpected role '${profile.role}'`);
        continue;
      }

      if (profile.role === "over_shepherd") {
        await deactivateOverShepherdLinks(client, spec.email, dryRun, safeLog);
      }

      if (dryRun) {
        safeLog(
          `  profile: would deactivate (status=inactive, auth_user_id=null)`
        );
        safeLog(`  group_leaders: would deactivate all rows for this profile`);
      } else {
        const { error: glErr } = await client
          .from("group_leaders")
          .update({ active: false })
          .eq("profile_id", profile.id);
        if (glErr)
          throw new Error(`group_leaders deactivate failed: ${glErr.message}`);
        safeLog(`  group_leaders: deactivated`);

        const { error: pErr } = await client
          .from("profiles")
          .update({ status: "inactive", auth_user_id: null })
          .eq("id", profile.id)
          .in("role", Array.from(REMOVABLE_ROLES));
        if (pErr) throw new Error(`profile deactivate failed: ${pErr.message}`);
        safeLog(`  profile: deactivated`);
      }
    } catch (err) {
      exitCode = 1;
      const msg = err instanceof Error ? err.message : String(err);
      safeLog(`  ERROR: ${redact(msg, secrets)}`);
    }
  }

  safeLog(`\nArchive test groups (if unambiguously test-owned):`);
  for (const key of ["A", "B"] as const) {
    try {
      await archiveTestGroup(client, key, dryRun, safeLog);
    } catch (err) {
      exitCode = 1;
      const msg = err instanceof Error ? err.message : String(err);
      safeLog(`  ERROR: ${redact(msg, secrets)}`);
    }
  }

  safeLog(`\nremove-test-auth-users: done (exitCode=${exitCode})`);
  return exitCode;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(msg);
    process.exit(1);
  });
