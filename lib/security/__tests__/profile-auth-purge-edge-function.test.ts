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

  it("resumes a partial purge from the profile tombstone", () => {
    const text = source();
    expect(text).toContain('.from("tombstones")');
    expect(text).toContain('.eq("entity_type", "profile")');
    expect(text).toContain('.eq("entity_id", profileId)');
    expect(text).toContain("row_snapshot?.auth_user_id");
  });

  it("orders DB purge before Auth deletion and audit recording", () => {
    const text = source();
    const purge = text.search(
      /callerClient\.rpc\(\s*"super_admin_permanent_delete"/
    );
    const authDelete = text.indexOf("service.auth.admin.deleteUser(");
    const audit = text.search(
      /service\.rpc\(\s*"service_record_profile_auth_purge"/
    );
    expect(purge).toBeGreaterThan(-1);
    expect(authDelete).toBeGreaterThan(purge);
    expect(audit).toBeGreaterThan(authDelete);
  });

  it("is declared as an authenticated production Edge Function", () => {
    const config = readFileSync(CONFIG_PATH, "utf8");
    expect(config).toMatch(
      /\[functions\.purge-profile-auth\][\s\S]*?verify_jwt\s*=\s*true/
    );
  });

  it("logs identifiers and stages without target email plaintext", () => {
    const text = source();
    expect(text).toContain("target_profile_id");
    expect(text).toContain("target_auth_user_id");
    expect(text).toContain("stage:");
    expect(text).not.toContain("target_email");
    expect(text).not.toContain('.select("id, auth_user_id, email');
  });
});
