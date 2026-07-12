import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const MIGRATION = fileURLToPath(
  new URL(
    "../../../supabase/migrations/20260718000000_harden_invite_throttle_retention.sql",
    import.meta.url
  )
);

let sql = "";
beforeAll(() => {
  sql = readFileSync(MIGRATION, "utf8").toLowerCase();
});

describe("invite redemption throttle privacy and retention migration", () => {
  it("purges legacy rows that may contain literal client IPs", () => {
    expect(sql).toMatch(/delete\s+from\s+public\.invite_redeem_throttle\s*;/);
  });

  it("rejects every key outside the versioned HMAC contract", () => {
    expect(sql).toMatch(
      /alter table public\.invite_redeem_throttle[\s\S]*?add constraint invite_redeem_throttle_key_hmac_check[\s\S]*?check \(throttle_key ~ '\^ip:v1:\[0-9a-f\]\{64\}\$'\)/
    );
    expect(
      sql.indexOf("delete from public.invite_redeem_throttle")
    ).toBeLessThan(sql.indexOf("invite_redeem_throttle_key_hmac_check"));
    expect(sql).toContain("^ip:v1:[0-9a-f]{64}$");
    expect(sql).toMatch(/raise exception 'invalid_throttle_key'/);
  });

  it("adds an attempted-at index and prunes expired rows globally", () => {
    expect(sql).toContain("invite_redeem_throttle_attempted_at_idx");
    const body = sql.match(
      /create or replace function public\.check_invite_redeem_rate[\s\S]*?\$\$;/
    )?.[0];
    expect(body).toBeTruthy();
    expect(body).toMatch(
      /delete\s+from\s+public\.invite_redeem_throttle\s+where\s+attempted_at\s*<\s*now\(\)\s*-\s*v_window/
    );
    expect(body).not.toMatch(
      /delete\s+from\s+public\.invite_redeem_throttle[\s\S]*?where\s+throttle_key\s*=\s*p_key[\s\S]*?attempted_at\s*</
    );
  });

  it("keeps the RPC service-role-only with a pinned search path", () => {
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = public, pg_temp");
    expect(sql).toMatch(
      /revoke all on function public\.check_invite_redeem_rate\(text, integer, integer\)\s+from public/
    );
    expect(sql).toMatch(
      /grant execute on function public\.check_invite_redeem_rate\(text, integer, integer\)\s+to service_role/
    );
  });
});
