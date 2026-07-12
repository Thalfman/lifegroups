import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SOURCE_PATH = fileURLToPath(
  new URL(
    "../../../supabase/functions/purge-profile-auth/index.ts",
    import.meta.url
  )
);
const CONFIG_PATH = fileURLToPath(
  new URL("../../../supabase/config.toml", import.meta.url)
);

function source(): string {
  return readFileSync(SOURCE_PATH, "utf8");
}

describe("#881 purge-profile-auth Edge Function", () => {
  it("revalidates the caller and enforces an active Super-Admin profile", () => {
    const text = source();
    expect(text).toContain("anon.auth.getUser()");
    expect(text).toContain('.eq("auth_user_id", authUserId)');
    expect(text).toContain('callerProfile.status !== "active"');
    expect(text).toContain('callerProfile.role !== "super_admin"');
  });

  it("resumes a partial purge only from the service-only purge job", () => {
    const text = source();
    expect(text).toContain('.from("profile_auth_purge_jobs")');
    expect(text).toContain(
      '.select("tombstone_id, auth_user_id, outcome, completed_at")'
    );
    expect(text).toContain('.eq("profile_id", profileId)');
    expect(text).not.toContain('.from("tombstones")');
    expect(text).not.toContain("row_snapshot");
  });

  it("re-reads the committed purge job before deleting the fresh-path Auth user", () => {
    const text = source();
    const purge = text.search(
      /callerClient\.rpc\(\s*"super_admin_permanent_delete"/
    );
    const freshJobRead = text.indexOf('.eq("tombstone_id", data)', purge);
    const authDelete = text.indexOf("service.auth.admin.deleteUser(");
    const audit = text.search(
      /service\.rpc\(\s*"service_record_profile_auth_purge"/
    );
    expect(text).not.toContain('.select("id, auth_user_id, role")');
    expect(text).not.toContain("target.auth_user_id");
    expect(freshJobRead).toBeGreaterThan(purge);
    expect(authDelete).toBeGreaterThan(freshJobRead);
    expect(audit).toBeGreaterThan(authDelete);
    expect(text).toContain("authUserId: job.auth_user_id");
    expect(text).toContain('"purge_job_lookup_failed"');
    expect(text).toContain('"database_profile_purge_completed"');
  });

  it("is declared as an authenticated production Edge Function", () => {
    const config = readFileSync(CONFIG_PATH, "utf8");
    expect(config).toMatch(
      /\[functions\.purge-profile-auth\][\s\S]*?verify_jwt\s*=\s*true/
    );
  });

  it("returns a completed retry without trying to recover the cleared Auth UUID", () => {
    const text = source();
    expect(text).toContain("completedOutcome");
    expect(text).toContain('stage: "already_complete"');
    expect(text).toContain("authUserState: completedOutcome");
  });

  it("logs structural identifiers and stages without Auth UUID or email plaintext", () => {
    const text = source();
    expect(text).toContain("target_profile_id");
    expect(text).not.toContain("target_auth_user_id");
    expect(text).toContain("stage:");
    expect(text).not.toContain("target_email");
    expect(text).not.toContain('.select("id, auth_user_id, email');
  });
});
